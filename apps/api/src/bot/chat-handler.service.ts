import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { TwitchApiService } from './twitch-api.service';
import { BotEventsGateway } from './bot-events.gateway';
import { RateLimiterService } from './rate-limiter.service';
import { ModerationService } from './moderation.service';
import { XPService } from './xp.service';
import { VariableService } from './variable.service';
import { AuditService } from './audit.service';
import { TimerService } from './timer.service';
import * as tmi from 'tmi.js';

@Injectable()
export class ChatHandlerService {
    private readonly logger = new Logger(ChatHandlerService.name);
    private cooldowns: Map<string, number> = new Map();
    private readonly startTime = Date.now();

    constructor(
        private prisma: PrismaService,
        private rateLimiter: RateLimiterService,
        private moderation: ModerationService,
        private xp: XPService,
        private variableService: VariableService,
        private timerService: TimerService,
        private twitchApiService: TwitchApiService,
        private botEvents: BotEventsGateway,
        private auditService: AuditService,
    ) { }

    async handleMessage(channelName: string, userstate: tmi.ChatUserstate, message: string, client: tmi.Client) {
        this.logger.log(`[MSG] Received: "${message}" from ${userstate.username} in #${channelName}`);
        const channel = channelName.replace('#', '');
        const twitchId = (userstate as any)['room-id'];

        let tenant;
        if (twitchId) {
            tenant = await this.prisma.tenant.findUnique({ where: { twitchId } });
        }

        if (!tenant) {
            // Fallback: search by channel name (targetChannel or name)
            tenant = await (this.prisma.tenant as any).findFirst({
                where: {
                    OR: [
                        { targetChannel: channel },
                        { name: channel }
                    ]
                }
            });
        }

        if (!tenant) {
            this.logger.warn(`[MSG] No tenant found for room-id: ${twitchId} (channel: #${channelName})`);
            return;
        }
        const tenantId = tenant.id;
        this.logger.log(`[MSG] Identified Tenant: ${tenant.name} (${tenantId})`);

        // 1. Moderation Check
        const isClean = await this.moderation.evaluate(tenantId, message, userstate, client, channelName);
        if (!isClean) {
            this.logger.log(`[MSG] Message blocked by moderation.`);
            return;
        }

        // 2. Command Check
        if (message.startsWith('!')) {
            this.logger.log(`[MSG] Potential command detected: ${message}`);
            try {
                await this.handleCommand(tenant, message, userstate, channelName);
            } catch (err) {
                this.logger.error(`[MSG] Command execution failed for ${message}`, err);
            }
        }

        // 3. XP Tracking (Non-blocking)
        this.xp.trackActivity(tenantId, userstate['user-id']!, userstate['display-name'] || userstate.username!)
            .catch(err => this.logger.error(`[MSG] XP Tracking failed`, err));

        // 4. Timer Check (Non-blocking)
        this.timerService.handleMessage(tenantId, channelName)
            .catch(err => this.logger.error(`[MSG] Timer check failed`, err));

        // 5. Logging (Non-blocking)
        this.logChat(tenantId, userstate, message)
            .catch(err => this.logger.error(`[MSG] Chat logging failed`, err));
    }

    private async handleCommand(tenant: any, message: string, userstate: tmi.ChatUserstate, channelName: string) {
        const tenantId = tenant.id;
        const parts = message.split(' ');
        const trigger = parts[0].toLowerCase().substring(1);
        const args = parts.slice(1);
        this.logger.log(`[CMD] Trigger: "${trigger}", Args: [${args.join(', ')}]`);

        // 2a. Built-in Commands
        const handled = await this.handleBuiltInCommand(trigger, args, userstate, channelName, tenant);
        if (handled) {
            this.logger.log(`[CMD] Handled by built-in logic.`);
            return;
        }

        // 2b. Custom Command Find by trigger OR alias
        this.logger.log(`[CMD] Searching DB for custom command: "${trigger}" for tenant ${tenantId}`);
        const command = await (this.prisma.command as any).findFirst({
            where: {
                tenantId,
                enabled: true,
                OR: [
                    { trigger },
                    { aliases: { path: [], array_contains: trigger } as any }
                ]
            }
        });

        if (command) {
            this.logger.log(`[CMD] Found command in DB: ID ${command.id}, Enabled: ${command.enabled}`);
        } else {
            this.logger.warn(`[CMD] No enabled custom command found for: "${trigger}"`);
        }

        if (command && command.enabled) {
            const cooldownKey = `${tenantId}:${command.id}`;
            const lastUsed = this.cooldowns.get(cooldownKey) || 0;
            const now = Date.now();
            if (now - lastUsed < command.cooldown * 1000) return;

            if (this.hasPermission(userstate, command.userLevel)) {
                // Increment usages
                await this.prisma.command.update({
                    where: { id: command.id },
                    data: { usages: { increment: 1 } }
                });

                const resData = (command as any).responses;

                let responses: string[] = [];
                if (Array.isArray(resData)) {
                    responses = resData;
                } else if (typeof resData === 'string') {
                    responses = [resData];
                } else if (resData && typeof resData === 'object' && (resData as any).items) {
                    responses = (resData as any).items;
                }

                const context = {
                    user: userstate['display-name'] || userstate.username!,
                    userId: userstate['user-id']!,
                    channel: channelName,
                    broadcasterId: tenant.twitchId,
                    count: command.usages + 1,
                    args,
                    msgId: userstate.id
                };

                // Send sequentially as separate messages based on responseType
                const responseType = (command as any).responseType || 'SAY';

                for (const response of responses) {
                    if (response.trim()) {
                        const parsedMessage = await this.variableService.parse(response, context);

                        switch (responseType) {
                            case 'MENTION':
                                await this.rateLimiter.enqueueMessage(channelName, `@${context.user}, ${parsedMessage}`, context.broadcasterId, tenant.botUsername || 'global');
                                break;
                            case 'REPLY':
                                // Using reply tag if userstate.id is available, otherwise fallback to mention
                                if (userstate.id) {
                                    await this.rateLimiter.enqueueMessage(channelName, parsedMessage, context.broadcasterId, tenant.botUsername || 'global', userstate.id);
                                } else {
                                    await this.rateLimiter.enqueueMessage(channelName, `@${context.user}, ${parsedMessage}`, context.broadcasterId, tenant.botUsername || 'global');
                                }
                                break;
                            case 'WHISPER':
                                // Note: whispers are sent directly to the user, not the channel
                                await this.rateLimiter.enqueueWhisper(context.user, parsedMessage);
                                break;
                            case 'SAY':
                            default:
                                await this.rateLimiter.enqueueMessage(channelName, parsedMessage, context.broadcasterId, tenant.botUsername || 'global');
                                break;
                        }
                    }
                }

                this.cooldowns.set(cooldownKey, now);
            }
        }
    }

    private async logChat(tenantId: string, userstate: tmi.ChatUserstate, message: string) {
        try {
            await this.prisma.chatLog.create({
                data: {
                    tenantId,
                    viewerId: userstate['user-id']!,
                    message,
                }
            });
        } catch (err) {
            this.logger.error('Failed to log chat', err);
        }
    }

    private hasPermission(userstate: tmi.ChatUserstate, requiredLevel: string): boolean {
        const levels = ['VIEWER', 'SUBSCRIBER', 'MODERATOR', 'BROADCASTER'];
        const userLevel = userstate.badges?.broadcaster ? 'BROADCASTER' : userstate.mod ? 'MODERATOR' : userstate.subscriber ? 'SUBSCRIBER' : 'VIEWER';
        return levels.indexOf(userLevel) >= levels.indexOf(requiredLevel);
    }

    private async getTenantIdByTwitchId(twitchId: string): Promise<string> {
        const tenant = await this.prisma.tenant.findUnique({ where: { twitchId } });
        return tenant?.id!;
    }

    private async handleBuiltInCommand(trigger: string, args: string[], userstate: tmi.ChatUserstate, channelName: string, tenant: any): Promise<boolean> {
        const tenantId = tenant.id;
        const broadcasterId = tenant.twitchId;
        const username = userstate['display-name'] || userstate.username!;

        // Check if the command exists and is enabled in the database (Built-in commands should be seeded)
        const command = await (this.prisma.command as any).findFirst({
            where: { tenantId, trigger, isBuiltIn: true, enabled: true }
        });

        if (!command) return false;

        switch (trigger) {
            case 'uptime': {
                const stream = await this.twitchApiService.getStreamInfo(channelName);
                if (stream) {
                    const startedAt = new Date(stream.started_at).getTime();
                    const diff = Date.now() - startedAt;
                    const h = Math.floor(diff / 3600000);
                    const m = Math.floor((diff % 3600000) / 60000);
                    await this.rateLimiter.enqueueMessage(channelName, `⏱️ ${channelName.replace('#', '')} has been live for ${h}h ${m}m!`, broadcasterId, tenant.botUsername || 'global');
                } else {
                    await this.rateLimiter.enqueueMessage(channelName, `⏱️ The stream is currently offline.`, broadcasterId, tenant.botUsername || 'global');
                }
                break;
            }

            case 'xp':
            case 'stats':
                const userXp = await this.xp.getUserStats(tenantId, userstate['user-id']!);
                if (userXp) {
                    await this.rateLimiter.enqueueMessage(channelName, `✨ ${username}, you are Level ${userXp.level} with ${userXp.xp.toLocaleString()} total XP and ${userXp.watchTime} minutes watched!`, broadcasterId, tenant.botUsername || 'global');
                } else {
                    await this.rateLimiter.enqueueMessage(channelName, `✨ ${username}, you haven't earned any XP yet. Stick around to start leveling up!`, broadcasterId, tenant.botUsername || 'global');
                }
                break;

            case 'top':
            case 'leaderboard':
                const topUsers = await this.xp.getTopUsers(tenantId, 5);
                const leaderboard = topUsers.map((u, i) => `${i + 1}. ${u.username} (Lvl ${u.level})`).join(' | ');
                await this.rateLimiter.enqueueMessage(channelName, `🏆 Top XP Leaders: ${leaderboard}`, broadcasterId, tenant.botUsername || 'global');
                break;

            case 'watchtime':
                const stats = await this.xp.getUserStats(tenantId, userstate['user-id']!);
                if (stats) {
                    const hours = Math.floor(stats.watchTime / 60);
                    const mins = stats.watchTime % 60;
                    await this.rateLimiter.enqueueMessage(channelName, `🕒 ${username}, you have watched for ${hours > 0 ? `${hours}h ` : ''}${mins}m!`, broadcasterId, tenant.botUsername || 'global');
                }
                break;

            case 'followage': {
                const tenantRecord = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
                const follow = await this.twitchApiService.getUserFollow(tenantRecord!.twitchId, userstate['user-id']!);
                if (follow) {
                    const followedAt = new Date(follow.followed_at);
                    const diff = Date.now() - followedAt.getTime();
                    const days = Math.floor(diff / 86400000);
                    await this.rateLimiter.enqueueMessage(channelName, `📅 ${username}, you have been following for ${days} days! (Since ${followedAt.toLocaleDateString()})`, broadcasterId, tenant.botUsername || 'global');
                } else {
                    await this.rateLimiter.enqueueMessage(channelName, `📅 ${username}, you are not following yet!`, broadcasterId, tenant.botUsername || 'global');
                }
                break;
            }

            case 'game': {
                const stream = await this.twitchApiService.getStreamInfo(channelName);
                await this.rateLimiter.enqueueMessage(channelName, `🎮 Current Game: ${stream?.game_name || 'Offline/Unknown'}`, broadcasterId, tenant.botUsername || 'global');
                break;
            }

            case 'title': {
                const stream = await this.twitchApiService.getStreamInfo(channelName);
                await this.rateLimiter.enqueueMessage(channelName, `🎬 Stream Title: ${stream?.title || 'Offline/No Title'}`, broadcasterId, tenant.botUsername || 'global');
                break;
            }

            case 'socials':
                await this.rateLimiter.enqueueMessage(channelName, `🔗 Stay connected! Follow us on Twitter and Instagram @StreamRealm_Mock`, broadcasterId, tenant.botUsername || 'global');
                break;

            case 'commands':
            case 'help':
                const customCommands = await this.prisma.command.findMany({
                    where: { tenantId, enabled: true, isBuiltIn: false } as any,
                    select: { trigger: true }
                });
                const builtInList = ['uptime', 'xp', 'stats', 'top', 'leaderboard', 'watchtime', 'followage', 'game', 'title', 'socials', 'commands', 'help', 'ping', 'shoutout', 'so'];
                const listStr = [...builtInList, ...customCommands.map(c => c.trigger)].map(t => `!${t}`).join(', ');
                await this.rateLimiter.enqueueMessage(channelName, `📜 Available commands: ${listStr.length > 200 ? listStr.substring(0, 197) + '...' : listStr}`, broadcasterId, tenant.botUsername || 'global');
                break;

            case 'ping':
                await this.rateLimiter.enqueueMessage(channelName, `🏓 Pong! StreamRealm Bot is online and operational. [Uptime: ${this.getUptime()}]`, broadcasterId, tenant.botUsername || 'global');
                break;

            case 'shoutout':
            case 'so':
                if (this.hasPermission(userstate, 'MODERATOR')) {
                    const target = args[0]?.replace('@', '');
                    if (target) {
                        await this.rateLimiter.enqueueMessage(channelName, `📢 Go check out ${target} at twitch.tv/${target}! They are doing amazing things. 💜`, broadcasterId, tenant.botUsername || 'global');
                    }
                }
                break;

            case '8ball': {
                const answers = ['Yes', 'No', 'Maybe', 'Outlook good', 'Ask again later', 'Definitely not', 'Concentrate and ask again', 'It is certain'];
                const answer = answers[Math.floor(Math.random() * answers.length)];
                await this.rateLimiter.enqueueMessage(channelName, `${username}, the magic 8-ball says: ${answer}`, broadcasterId, tenant.botUsername || 'global');
                break;
            }

            case 'dadjoke': {
                const jokes = [
                    "I'm afraid for the calendar. Its days are numbered.",
                    "Why do fathers take an extra pair of socks when they go golfing? In case they get a hole in one!",
                    "What’s the best thing about Switzerland? I don’t know, but the flag is a big plus.",
                    "Why don't skeletons fight each other? They don't have the guts.",
                    "I used to be a baker, but I couldn't make enough dough.",
                    "I'm on a seafood diet. I see food and I eat it."
                ];
                const joke = jokes[Math.floor(Math.random() * jokes.length)];
                await this.rateLimiter.enqueueMessage(channelName, joke, broadcasterId, tenant.botUsername || 'global');
                break;
            }

            case 'fact': {
                const facts = [
                    "Honey never spoils.",
                    "Octopuses have three hearts.",
                    "A day on Venus is longer than a year on Venus.",
                    "Bananas are berries, but strawberries aren't.",
                    "There are more trees on Earth than stars in the Milky Way."
                ];
                const fact = facts[Math.floor(Math.random() * facts.length)];
                await this.rateLimiter.enqueueMessage(channelName, `Fact: ${fact}`, broadcasterId, tenant.botUsername || 'global');
                break;
            }

            case 'permit':
                if (this.hasPermission(userstate, 'MODERATOR')) {
                    const target = args[0]?.replace('@', '');
                    if (target) {
                        this.moderation.permitUser(channelName, target);
                        await this.rateLimiter.enqueueMessage(channelName, `${target} is now permitted to post links for 2 minutes.`, broadcasterId, tenant.botUsername || 'global');
                    }
                }
                break;

            case 'addcom':
                if (this.hasPermission(userstate, 'MODERATOR')) {
                    const newTrigger = args[0]?.replace('!', '').toLowerCase();
                    const newResponse = args.slice(1).join(' ');
                    if (newTrigger && newResponse) {
                        const normalizedResponse = this.variableService.normalizeSyntax(newResponse);
                        await (this.prisma.command as any).create({
                            data: {
                                tenantId,
                                trigger: newTrigger,
                                responses: [normalizedResponse],
                                enabled: true,
                                isBuiltIn: false,
                                userLevel: 'VIEWER'
                            }
                        });
                        this.botEvents.emitCommandUpdate(tenantId);
                        await this.auditService.log({
                            tenantId,
                            action: 'COMMAND_ADD',
                            actor: username,
                            target: `!${newTrigger}`,
                            metadata: { response: newResponse }
                        });
                        await this.rateLimiter.enqueueMessage(channelName, `Command !${newTrigger} has been added.`, broadcasterId, tenant.botUsername || 'global');
                    }
                }
                break;

            case 'delcom':
                if (this.hasPermission(userstate, 'MODERATOR')) {
                    const delTrigger = args[0]?.replace('!', '').toLowerCase();
                    if (delTrigger) {
                        const cmd = await (this.prisma.command as any).findFirst({ where: { tenantId, trigger: delTrigger, isBuiltIn: false } });
                        if (cmd) {
                            await this.prisma.command.delete({ where: { id: cmd.id } });
                            this.botEvents.emitCommandUpdate(tenantId);
                            await this.auditService.log({
                                tenantId,
                                action: 'COMMAND_DELETE',
                                actor: username,
                                target: `!${delTrigger}`
                            });
                            await this.rateLimiter.enqueueMessage(channelName, `Command !${delTrigger} has been deleted.`, broadcasterId, tenant.botUsername || 'global');
                        } else {
                            await this.rateLimiter.enqueueMessage(channelName, `Error: Command !${delTrigger} not found or is a built-in.`, broadcasterId, tenant.botUsername || 'global');
                        }
                    }
                }
                break;

            case 'editcom':
                if (this.hasPermission(userstate, 'MODERATOR')) {
                    const editTrigger = args[0]?.replace('!', '').toLowerCase();
                    const editResponse = args.slice(1).join(' ');
                    if (editTrigger && editResponse) {
                        const normalizedResponse = this.variableService.normalizeSyntax(editResponse);
                        const cmd = await (this.prisma.command as any).findFirst({ where: { tenantId, trigger: editTrigger, isBuiltIn: false } });
                        if (cmd) {
                            await this.prisma.command.update({
                                where: { id: cmd.id },
                                data: { responses: [normalizedResponse] }
                            });
                            this.botEvents.emitCommandUpdate(tenantId);
                            await this.auditService.log({
                                tenantId,
                                action: 'COMMAND_EDIT',
                                actor: username,
                                target: `!${editTrigger}`,
                                metadata: { response: editResponse }
                            });
                            await this.rateLimiter.enqueueMessage(channelName, `Command !${editTrigger} has been updated.`, broadcasterId, tenant.botUsername || 'global');
                        } else {
                            await this.rateLimiter.enqueueMessage(channelName, `Error: Command !${editTrigger} not found or is a built-in.`, broadcasterId, tenant.botUsername || 'global');
                        }
                    }
                }
                break;

            default:
                return false;
        }

        // Increment usage for built-in as well
        await this.prisma.command.update({
            where: { id: command.id },
            data: { usages: { increment: 1 } }
        });

        return true;
    }

    private getUptime(): string {
        const diff = Date.now() - this.startTime;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const parts = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        parts.push(`${seconds}s`);
        return parts.join(' ');
    }
}

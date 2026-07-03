import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { TwitchApiService } from './twitch-api.service';
import { BotEventsGateway } from './bot-events.gateway';
import { RateLimiterService } from './rate-limiter.service';
import { ModerationService } from './moderation.service';
import { XpService } from './xp.service';
import { VariableService } from './variable.service';
import { AuditService } from './audit.service';
import { TimerService } from './timer.service';
import { BattleService } from './battle.service';
import { SongRequestService } from './song-request.service';
import { OverlayEventsGateway } from '../overlay/overlay-events.gateway';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
        private xp: XpService,
        private variableService: VariableService,
        @Inject(forwardRef(() => TimerService))
        private timerService: TimerService,
        private twitchApiService: TwitchApiService,
        private botEvents: BotEventsGateway,
        private auditService: AuditService,
        private eventEmitter: EventEmitter2,
        private battleService: BattleService,
        private overlayEvents: OverlayEventsGateway,
        private songRequestService: SongRequestService,
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
                const handled = await this.handleCommand(tenant, message, userstate, channelName);
                if (handled) return; // Stop if standard command executed
            } catch (err) {
                this.logger.error(`[MSG] Command execution failed for ${message}`, err);
            }
        }

        // 3. Regex Command Check
        try {
            await this.handleRegexCommands(tenant, message, userstate, channelName);
        } catch (err) {
            this.logger.error(`[MSG] Regex command execution failed`, err);
        }

        // 3. XP Tracking & Achievements (Non-blocking)
        const userId = userstate['user-id']!;
        this.xp.addXp(tenantId, userId, 10) // 10 XP per message
            .catch(err => this.logger.error(`[MSG] XP Add failed`, err));

        this.eventEmitter.emit('chat.message', {
            tenantId,
            userId,
            messageCount: 1 // Increment logic should happen in service listener if needed, or we just emit raw
        });

        // 4. Timer Check (Non-blocking)
        this.timerService.handleMessage(tenantId, channelName)
            .catch((err: any) => this.logger.error(`[MSG] Timer check failed`, err));

        // 5. Logging (Non-blocking)
        this.logChat(tenantId, userstate, message)
            .catch(err => this.logger.error(`[MSG] Chat logging failed`, err));

        // 6. Overlay Update (Non-blocking)
        this.emitToOverlays(tenantId, userstate, message)
            .catch(err => this.logger.error(`[MSG] Overlay emit failed`, err));
    }

    private async emitToOverlays(tenantId: string, userstate: tmi.ChatUserstate, message: string) {
        const overlays = await this.prisma.overlay.findMany({
            where: { tenantId }
        });

        for (const overlay of overlays) {
            this.overlayEvents.emitChatMessage(overlay.id, {
                username: userstate['display-name'] || userstate.username!,
                message,
                color: userstate.color,
                // Send badge set + version (e.g. subscriber/12) so the overlay can load the real image.
                badges: Object.entries(userstate.badges || {}).map(([setId, version]) => ({ setId, version: String(version) })),
                roomId: userstate['room-id'],
                emotes: userstate.emotes,
            });
        }
    }

    private async handleCommand(tenant: any, message: string, userstate: tmi.ChatUserstate, channelName: string): Promise<boolean> {
        const tenantId = tenant.id;
        const broadcasterId = tenant.twitchId; // FIX: Define this early
        const botUsername = tenant.botUsername || 'global'; // FIX: Define this early

        const parts = message.split(' ');
        const trigger = parts[0].toLowerCase().substring(1);
        const args = parts.slice(1);
        this.logger.log(`[CMD] Trigger: "${trigger}", Args: [${args.join(', ')}]`);

        // 2a. Built-in Commands
        const handled = await this.handleBuiltInCommand(trigger, args, userstate, channelName, tenant);
        if (handled) {
            this.logger.log(`[CMD] Handled by built-in logic.`);
            return true;
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
            if (now - lastUsed < command.cooldown * 1000) return true; // Cooldown hit, but we consider it "matched" so we return true to stop regex? Or false? Usually true to prevent spam.

            if (this.hasPermission(userstate, command.userLevel)) {
                // Increment usages
                await this.prisma.command.update({
                    where: { id: command.id },
                    data: { usages: { increment: 1 } }
                });

                const resDataRaw = (command as any).responses;

                let responses: string[] = [];
                try {
                    if (typeof resDataRaw === 'string') {
                        const parsed = JSON.parse(resDataRaw);
                        responses = Array.isArray(parsed) ? parsed : [resDataRaw];
                    } else if (Array.isArray(resDataRaw)) {
                        responses = resDataRaw;
                    }
                } catch (e) {
                    responses = [resDataRaw];
                }

                const context = {
                    user: userstate['display-name'] || userstate.username!,
                    userId: userstate['user-id']!,
                    channel: channelName,
                    broadcasterId: broadcasterId, // FIX: Use the variable we defined
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
                                // FIX: Pass broadcasterId and botUsername
                                await this.rateLimiter.enqueueMessage(
                                    channelName,
                                    `@${context.user}, ${parsedMessage}`,
                                    broadcasterId,
                                    botUsername
                                );
                                break;
                            case 'REPLY':
                                // FIX: Pass broadcasterId and botUsername
                                await this.rateLimiter.enqueueMessage(
                                    channelName,
                                    parsedMessage,
                                    broadcasterId,
                                    botUsername,
                                    context.msgId
                                );
                                break;
                            default:
                                // FIX: Pass broadcasterId and botUsername
                                await this.rateLimiter.enqueueMessage(
                                    channelName,
                                    parsedMessage,
                                    broadcasterId,
                                    botUsername
                                );
                                break;
                        }
                    }
                }

                this.cooldowns.set(cooldownKey, now);
                this.logger.log(`[CMD] Executed: !${trigger} (Usage: ${command.usages + 1})`);
                return true;
            }
        }
        return false;
    }

    private async handleRegexCommands(tenant: any, message: string, userstate: tmi.ChatUserstate, channelName: string) {
        const tenantId = tenant.id;
        // Fetch all regex commands for this tenant
        const regexCommands = await (this.prisma.command as any).findMany({
            where: {
                tenantId,
                enabled: true,
                isRegex: true
            }
        });

        for (const cmd of regexCommands) {
            try {
                const regex = new RegExp(cmd.trigger, 'i'); // Case insensitive default?
                const match = message.match(regex);

                if (match) {
                    this.logger.log(`[REGEX] Matched: "${cmd.trigger}" in "${message}"`);

                    // Cooldown Check
                    // We need a unique key for regex commands too
                    const cooldownKey = `${tenantId}:${cmd.id}`;
                    const lastUsed = this.cooldowns.get(cooldownKey) || 0;
                    const now = Date.now();
                    const globalCooldown = cmd.cooldown || 0;
                    const userCooldown = cmd.userCooldown || 0;

                    // Global Cooldown
                    if (now - lastUsed < globalCooldown * 1000) continue;

                    // User Cooldown (Need to track per user)
                    // Simple memory map: tenant:cmd:userId -> timestamp
                    // We can reuse the same map but keys need to be robust
                    const userCooldownKey = `${tenantId}:${cmd.id}:${userstate['user-id']}`;
                    const lastUsedUser = this.cooldowns.get(userCooldownKey) || 0;
                    if (now - lastUsedUser < userCooldown * 1000) continue;

                    if (this.hasPermission(userstate, cmd.userLevel)) {
                        // Increment usage
                        await this.prisma.command.update({
                            where: { id: cmd.id },
                            data: { usages: { increment: 1 } }
                        });

                        const resData = (cmd as any).responses;
                        let responses: string[] = [];
                        if (Array.isArray(resData)) {
                            responses = resData;
                        } else if (typeof resData === 'string') {
                            responses = [resData];
                        }

                        // Map capture groups to args
                        // args[0] in variable service is usually first word after command
                        // For regex, let's map capture groups 1..N to args[0]..args[N-1]
                        // match[0] is full match. match[1] is first group.
                        const args = match.slice(1);

                        const context = {
                            user: userstate['display-name'] || userstate.username!,
                            userId: userstate['user-id']!,
                            channel: channelName,
                            broadcasterId: tenant.twitchId,
                            count: cmd.usages + 1,
                            args,
                            msgId: userstate.id
                        };

                        const responseType = (cmd as any).responseType || 'SAY';

                        for (const response of responses) {
                            if (response.trim()) {
                                const parsedMessage = await this.variableService.parse(response, context);

                                switch (responseType) {
                                    case 'MENTION':
                                        await this.rateLimiter.enqueueMessage(channelName, `@${context.user}, ${parsedMessage}`, tenant.twitchId, tenant.botUsername || 'global');
                                        break;
                                    case 'REPLY':
                                        await this.rateLimiter.enqueueMessage(channelName, parsedMessage, tenant.twitchId, tenant.botUsername || 'global', context.msgId);
                                        break;
                                    default:
                                        await this.rateLimiter.enqueueMessage(channelName, parsedMessage, tenant.twitchId, tenant.botUsername || 'global');
                                        break;
                                }
                            }
                        }

                        // Set Cooldowns
                        this.cooldowns.set(cooldownKey, now);
                        this.cooldowns.set(userCooldownKey, now);
                    }
                }
            } catch (err) {
                this.logger.error(`[REGEX] Error processing regex "${cmd.trigger}"`, err);
            }
        }
    }

    private hasPermission(userstate: tmi.ChatUserstate, requiredLevel: string): boolean {
        const isBroadcaster = userstate.badges?.broadcaster === '1';
        const isMod = userstate.mod || userstate.badges?.moderator === '1';
        const isVip = userstate.badges?.vip === '1';
        const isSub = userstate.subscriber || !!userstate.badges?.subscriber;

        switch (requiredLevel) {
            case 'BROADCASTER':
                return isBroadcaster;
            case 'MODERATOR':
                return isBroadcaster || isMod;
            case 'VIP':
                return isBroadcaster || isMod || isVip;
            case 'SUBSCRIBER':
                return isBroadcaster || isMod || isVip || isSub;
            case 'VIEWER':
            default:
                return true;
        }
    }

    private async logChat(tenantId: string, userstate: tmi.ChatUserstate, message: string) {
        await this.prisma.chatLog.create({
            data: {
                tenantId,
                viewerId: userstate['user-id']!,
                message,
            },
        });
    }

    private async handleBuiltInCommand(trigger: string, args: string[], userstate: tmi.ChatUserstate, channelName: string, tenant: any): Promise<boolean> {
        const tenantId = tenant.id;
        const broadcasterId = tenant.twitchId;
        const username = userstate['display-name'] || userstate.username!;
        const userId = userstate['user-id']!;

        // Check if the built-in command exists and is enabled in DB
        const command = await (this.prisma.command as any).findFirst({
            where: {
                tenantId,
                trigger,
                isBuiltIn: true,
                enabled: true
            }
        });

        if (!command) {
            this.logger.log(`[CMD] Built-in command "${trigger}" not found or disabled in DB.`);
            return false;
        }

        // Execute Built-In Logic
        switch (trigger) {
            case 'uptime': {
                const stream = await this.twitchApiService.getStreamInfo(channelName);
                if (stream) {
                    const startedAt = new Date(stream.started_at);
                    const now = new Date();
                    const diff = now.getTime() - startedAt.getTime();
                    const hours = Math.floor(diff / (1000 * 60 * 60));
                    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    await this.rateLimiter.enqueueMessage(channelName, `Stream has been live for ${hours}h ${minutes}m`, broadcasterId, tenant.botUsername || 'global');
                } else {
                    await this.rateLimiter.enqueueMessage(channelName, 'Stream is currently offline.', broadcasterId, tenant.botUsername || 'global');
                }
                break;
            }

            case 'game':
            case 'title': {
                const info = await this.twitchApiService.getChannelInfo(broadcasterId);
                if (info) {
                    if (trigger === 'game') {
                        await this.rateLimiter.enqueueMessage(channelName, `Current game: ${info.game_name || 'Unknown'}`, broadcasterId, tenant.botUsername || 'global');
                    } else {
                        await this.rateLimiter.enqueueMessage(channelName, `Current title: ${info.title}`, broadcasterId, tenant.botUsername || 'global');
                    }
                }
                break;
            }

            case 'stats':
            case 'xp': {
                const user = await this.prisma.viewerProfile.findUnique({
                    where: {
                        tenantId_twitchUserId: {
                            tenantId,
                            twitchUserId: userId
                        }
                    }
                });

                if (user) {
                    await this.rateLimiter.enqueueMessage(channelName, `${username} | Level: ${user.level} | XP: ${user.xp} | Watchtime: ${Math.floor(user.watchTime / 60)}h`, broadcasterId, tenant.botUsername || 'global');
                } else {
                    await this.rateLimiter.enqueueMessage(channelName, `${username}, you don't have any stats yet. Start watching to earn XP!`, broadcasterId, tenant.botUsername || 'global');
                }
                break;
            }

            case 'top':
            case 'leaderboard': {
                const topUsers = await this.prisma.viewerProfile.findMany({
                    where: { tenantId },
                    orderBy: { xp: 'desc' },
                    take: 3
                });
                const leaderboard = topUsers.map((u: any, idx: number) => `${idx + 1}. ${u.username} (${u.xp} XP)`).join(' | ');
                await this.rateLimiter.enqueueMessage(channelName, `Top XP Leaders: ${leaderboard}`, broadcasterId, tenant.botUsername || 'global');
                break;
            }

            case 'watchtime': {
                const user = await this.prisma.viewerProfile.findUnique({
                    where: {
                        tenantId_twitchUserId: {
                            tenantId,
                            twitchUserId: userId
                        }
                    }
                });

                if (user) {
                    const hours = Math.floor(user.watchTime / 60);
                    const minutes = user.watchTime % 60;
                    await this.rateLimiter.enqueueMessage(channelName, `${username}, you have watched for ${hours}h ${minutes}m`, broadcasterId, tenant.botUsername || 'global');
                } else {
                    await this.rateLimiter.enqueueMessage(channelName, `${username}, you don't have any watchtime yet!`, broadcasterId, tenant.botUsername || 'global');
                }
                break;
            }

            case 'followage': {
                const follow = await this.twitchApiService.getUserFollow(broadcasterId, userId);
                if (follow) {
                    const followedAt = new Date(follow.followed_at);
                    const now = new Date();
                    const diff = now.getTime() - followedAt.getTime();
                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    await this.rateLimiter.enqueueMessage(channelName, `${username}, you have been following for ${days} days!`, broadcasterId, tenant.botUsername || 'global');
                } else {
                    await this.rateLimiter.enqueueMessage(channelName, `${username}, you are not following yet!`, broadcasterId, tenant.botUsername || 'global');
                }
                break;
            }

            case 'commands':
            case 'help': {
                const customCommands = await (this.prisma.command as any).findMany({
                    where: {
                        tenantId,
                        enabled: true,
                        isBuiltIn: false
                    }
                });
                const triggers = customCommands.map((c: any) => `!${c.trigger}`).join(', ');
                await this.rateLimiter.enqueueMessage(channelName, `Available commands: !uptime, !game, !title, !stats, !xp, !top, !leaderboard, !watchtime, !followage, !battle, !accept, !decline, !8ball, !dadjoke, !fact, !socials, !ping ${triggers ? `| Custom: ${triggers}` : ''}`, broadcasterId, tenant.botUsername || 'global');
                break;
            }

            case 'socials': {
                // Fetch from tenant settings
                await this.rateLimiter.enqueueMessage(channelName, `Follow us on our socials! [Add your social links in the dashboard]`, broadcasterId, tenant.botUsername || 'global');
                break;
            }

            case 'ping':
                await this.rateLimiter.enqueueMessage(channelName, `Pong! StreamPulse Bot is online and operational. [Uptime: ${this.getUptime()}]`, broadcasterId, tenant.botUsername || 'global');
                break;

            case 'shoutout':
            case 'so':
                if (this.hasPermission(userstate, 'MODERATOR')) {
                    const target = args[0]?.replace('@', '');
                    if (target) {
                        await this.rateLimiter.enqueueMessage(channelName, `Go check out ${target} at twitch.tv/${target}! They are doing amazing things.`, broadcasterId, tenant.botUsername || 'global');
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
                    "What's the best thing about Switzerland? I don't know, but the flag is a big plus.",
                    "Why don't skeletons fight each other? They don't have the guts.",
                    "I used to be a baker, but I couldn't make enough dough.",
                    "I'm on a seafood diet. I see food and I eat it."
                ];
                const joke = jokes[Math.floor(Math.random() * jokes.length)];
                await this.rateLimiter.enqueueMessage(channelName, joke, broadcasterId, tenant.botUsername || 'global');
                break;
            }

            case 'battle': {
                const opponent = args[0]?.replace('@', '');
                if (!opponent) {
                    await this.rateLimiter.enqueueMessage(channelName, `${username}, usage: !battle @username`, broadcasterId, tenant.botUsername || 'global');
                    break;
                }

                if (opponent.toLowerCase() === username.toLowerCase()) {
                    await this.rateLimiter.enqueueMessage(channelName, `${username}, you can't battle yourself!`, broadcasterId, tenant.botUsername || 'global');
                    break;
                }

                try {
                    // Resolve opponent ID first
                    const opponentInfo = await this.twitchApiService.getUserInfo(opponent);
                    if (!opponentInfo) {
                        await this.rateLimiter.enqueueMessage(
                            channelName,
                            `${username}, could not find user ${opponent} on Twitch!`,
                            broadcasterId,
                            tenant.botUsername || 'global'
                        );
                        break;
                    }
                    const opponentId = opponentInfo.id;
                    const challengerId = userId; // From userstate

                    const created = this.battleService.createChallenge(username, challengerId, opponent, opponentId, tenantId);
                    if (created) {
                        await this.rateLimiter.enqueueMessage(
                            channelName,
                            `${username} has challenged ${opponent} to a battle! @${opponent}, type !accept or !decline (90s)`,
                            broadcasterId,
                            tenant.botUsername || 'global'
                        );
                    } else {
                        await this.rateLimiter.enqueueMessage(
                            channelName,
                            `${username}, ${opponent} already has a pending challenge!`,
                            broadcasterId,
                            tenant.botUsername || 'global'
                        );
                    }
                } catch (err) {
                    this.logger.error('Battle challenge error:', err);
                    await this.rateLimiter.enqueueMessage(channelName, `${username}, failed to create challenge!`, broadcasterId, tenant.botUsername || 'global');
                }
                break;
            }

            case 'accept': {
                try {
                    const result = await this.battleService.acceptChallenge(username, userId, tenantId);
                    if (!result) {
                        await this.rateLimiter.enqueueMessage(
                            channelName,
                            `${username}, you don't have any pending challenges!`,
                            broadcasterId,
                            tenant.botUsername || 'global'
                        );
                    } else if (result.expired) {
                        await this.rateLimiter.enqueueMessage(
                            channelName,
                            `${username}, your challenge has expired!`,
                            broadcasterId,
                            tenant.botUsername || 'global'
                        );
                    } else if ('winner' in result) {
                        // Type guard: result has battle data
                        await this.rateLimiter.enqueueMessage(
                            channelName,
                            `${result.battle.challenger.username}(${result.challengerRoll}) vs ${result.battle.opponent.username}(${result.opponentRoll}) - ${result.winner} wins! [MMR: ${result.winner === username ? result.opponentNewMMR : result.challengerNewMMR} ${result.mmrChange > 0 ? '+' : ''}${result.winner === username ? result.mmrChange : -result.mmrChange}]`,
                            broadcasterId,
                            tenant.botUsername || 'global'
                        );
                    }
                } catch (err) {
                    this.logger.error('Accept battle error:', err);
                    await this.rateLimiter.enqueueMessage(channelName, `${username}, failed to accept battle!`, broadcasterId, tenant.botUsername || 'global');
                }
                break;
            }

            case 'decline': {
                const challenge = this.battleService.declineChallenge(username, tenantId);
                if (challenge) {
                    await this.rateLimiter.enqueueMessage(
                        channelName,
                        `${username} has declined ${challenge.challenger}'s battle challenge.`,
                        broadcasterId,
                        tenant.botUsername || 'global'
                    );
                } else {
                    await this.rateLimiter.enqueueMessage(
                        channelName,
                        `${username}, you don't have any pending challenges!`,
                        broadcasterId,
                        tenant.botUsername || 'global'
                    );
                }
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
                                responses: JSON.stringify([normalizedResponse]),
                                enabled: true,
                                isBuiltIn: false,
                                userLevel: 'VIEWER',
                                cooldown: 10,
                                category: 'General'
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
                                data: { responses: JSON.stringify([normalizedResponse]) }
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

            case 'sr':
            case 'songrequest': {
                // Check if Channel Points Only mode is enabled
                let settings: any = {};
                try {
                    settings = typeof tenant.settings === 'string' ? JSON.parse(tenant.settings) : (tenant.settings || {});
                } catch (e) { }

                if (settings.songRequestMode === 'points_only') {
                    await this.rateLimiter.enqueueMessage(channelName, `${username}, song requests are currently only allowed via Channel Point redemptions.`, broadcasterId, tenant.botUsername || 'global');
                    break;
                }

                const query = args.join(' ');
                if (!query) {
                    await this.rateLimiter.enqueueMessage(channelName, `${username}, usage: !sr <song name / artist>`, broadcasterId, tenant.botUsername || 'global');
                    break;
                }
                const result = await this.songRequestService.requestSong(tenantId, userId, username, query);
                await this.rateLimiter.enqueueMessage(channelName, result.message, broadcasterId, tenant.botUsername || 'global');
                break;
            }

            case 'skip':
                if (this.hasPermission(userstate, 'MODERATOR')) {
                    const success = await this.songRequestService.skipSong(tenantId);
                    if (success) {
                        await this.rateLimiter.enqueueMessage(channelName, `Skipping current song...`, broadcasterId, tenant.botUsername || 'global');
                    } else {
                        await this.rateLimiter.enqueueMessage(channelName, `Failed to skip. Is Spotify playing?`, broadcasterId, tenant.botUsername || 'global');
                    }
                }
                break;

            case 'queue': {
                const queue = await this.songRequestService.getQueue(tenantId);
                if (queue.length === 0) {
                    await this.rateLimiter.enqueueMessage(channelName, `The queue is currently empty.`, broadcasterId, tenant.botUsername || 'global');
                } else {
                    const queueStr = queue.map((s, i) => `${i + 1}. ${s.songTitle}`).join(' | ');
                    await this.rateLimiter.enqueueMessage(channelName, `Current Queue: ${queueStr}`, broadcasterId, tenant.botUsername || 'global');
                }
                break;
            }

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
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { VariableService } from './variable.service';
import { AuditService } from './audit.service';
import { UserLevel } from '@prisma/client';
import * as tmi from 'tmi.js';

@Injectable()
export class ModerationService {
    private readonly logger = new Logger(ModerationService.name);
    private permits: Map<string, Set<string>> = new Map(); // channel -> Set<username>

    constructor(
        private prisma: PrismaService,
        private variableService: VariableService,
        private auditService: AuditService
    ) { }

    permitUser(channelName: string, username: string, durationMinutes: number = 2) {
        const channel = channelName.toLowerCase();
        if (!this.permits.has(channel)) {
            this.permits.set(channel, new Set());
        }
        const user = username.toLowerCase().replace('@', '');
        this.permits.get(channel)!.add(user);

        this.logger.log(`[Moderation] ${user} permitted in ${channel} for ${durationMinutes}m`);

        setTimeout(() => {
            this.permits.get(channel)?.delete(user);
        }, durationMinutes * 60 * 1000);
    }

    private isPermitted(channelName: string, username: string): boolean {
        const channel = channelName.toLowerCase();
        const user = username.toLowerCase();
        return this.permits.get(channel)?.has(user) || false;
    }

    private getUserLevelRank(level: string): number {
        const ranks: Record<string, number> = {
            'VIEWER': 0,
            'SUBSCRIBER': 1,
            'MODERATOR': 2,
            'BROADCASTER': 3,
        };
        return ranks[level] ?? 0;
    }

    private getMessageUserLevel(userstate: tmi.ChatUserstate): string {
        if (userstate.badges?.broadcaster) return 'BROADCASTER';
        if (userstate.mod) return 'MODERATOR';
        if (userstate.badges?.subscriber) return 'SUBSCRIBER';
        return 'VIEWER';
    }

    async evaluate(tenantTwitchId: string, message: string, userstate: tmi.ChatUserstate, client: tmi.Client, channelName: string): Promise<boolean> {
        if (userstate.mod || userstate.badges?.broadcaster) return true;
        if (this.isPermitted(channelName, userstate.username!)) return true;

        const rules = await this.prisma.modRule.findMany({
            where: {
                tenant: { twitchId: tenantTwitchId },
                enabled: true,
            },
        });

        const activeUserLevel = this.getMessageUserLevel(userstate);
        const userRank = this.getUserLevelRank(activeUserLevel);

        for (const rule of rules) {
            const settings = (rule.settings as any) || {};

            // Bypass check
            if (settings.bypassLevel) {
                if (userRank >= this.getUserLevelRank(settings.bypassLevel)) continue;
            }

            // Min Length check
            if (settings.minLength && message.length < settings.minLength) continue;

            const isViolation = this.checkRule(rule, message);
            if (isViolation) {
                const action = settings.action || 'TIMEOUT';
                const duration = settings.duration || 600;
                const silent = settings.silent || false;
                const customMessage = settings.customMsg;

                // Execute Action
                try {
                    if (action === 'DELETE') {
                        await client.deletemessage(channelName, userstate.id!);
                    } else if (action === 'TIMEOUT') {
                        await client.timeout(channelName, userstate.username!, duration, `Moderation: ${rule.type}`);
                    } else if (action === 'BAN') {
                        await client.ban(channelName, userstate.username!, `Moderation: ${rule.type}`);
                    } else if (action === 'WARN') {
                        // Just warn in chat (not silent)
                    }

                    // Handle Feedback
                    if (!silent || action === 'WARN') {
                        const feedback = customMessage || this.getDefaultWarning(rule.type);
                        const parsedFeedback = await this.variableService.parse(feedback, {
                            user: userstate['display-name'] || userstate.username || '',
                            userId: userstate['user-id'] || '',
                            channel: channelName,
                            broadcasterId: tenantTwitchId,
                            count: 0,
                            args: []
                        });

                        await client.say(channelName, `@${userstate.username}, ${parsedFeedback}`);
                    }
                } catch (err: any) {
                    this.logger.error(`Failed to execute moderation action: ${err.message}`);
                }

                // Log to Audit Service (Sentinel)
                const tenant = await this.prisma.tenant.findFirst({
                    where: { OR: [{ id: tenantTwitchId }, { twitchId: tenantTwitchId }] }
                });

                if (tenant) {
                    await this.auditService.log({
                        tenantId: tenant.id,
                        action: action,
                        actor: 'Sentinel',
                        target: userstate.username,
                        metadata: {
                            ruleType: rule.type,
                            duration: duration,
                            message: message.substring(0, 100)
                        }
                    });
                }

                this.logger.log(`[Moderation] ${userstate.username} flagged for ${rule.type} (Action: ${action})`);
                return false;
            }
        }

        return true;
    }

    private getDefaultWarning(type: string): string {
        switch (type) {
            case 'CAPS': return "please stop using excessive caps!";
            case 'LINKS': return "links are not allowed in this channel.";
            case 'SPAM': return "stop spamming, please.";
            case 'SYMBOLS': return "too many symbols!";
            case 'EMOTES': return "too many emotes!";
            case 'BANNED_WORDS': return "that word is not allowed here.";
            default: return "please follow the chat rules.";
        }
    }

    private checkRule(rule: any, message: string): boolean {
        const settings = rule.settings || {};
        const threshold = settings.threshold ?? 0.7; // Use ?? for zero thresholds

        switch (rule.type) {
            case 'CAPS':
                return this.isExcessiveCaps(message, threshold);
            case 'LINKS':
                return this.containsLinks(message);
            case 'SPAM':
                return this.isSpam(message, threshold);
            case 'SYMBOLS':
                return this.isExcessiveSymbols(message, threshold);
            case 'EMOTES':
                return this.isExcessiveEmotes(message, threshold);
            case 'BANNED_WORDS':
                return this.hasBannedWords(message, settings.words || []);
            default:
                return false;
        }
    }

    private isExcessiveCaps(message: string, threshold: number): boolean {
        const caps = message.replace(/[^A-Z]/g, "").length;
        if (message.length === 0) return false;
        return caps / message.length > threshold;
    }

    private containsLinks(message: string): boolean {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return urlRegex.test(message);
    }

    private isSpam(message: string, threshold: number): boolean {
        const words = message.trim().split(/\s+/);
        if (words.length < 3) return false;
        const unique = new Set(words).size;
        return (1 - (unique / words.length)) > threshold;
    }

    private isExcessiveSymbols(message: string, threshold: number): boolean {
        const symbols = message.replace(/[a-zA-Z0-9\s]/g, "").length;
        if (message.length === 0) return false;
        return symbols / message.length > threshold;
    }

    private isExcessiveEmotes(message: string, threshold: number): boolean {
        const words = message.trim().split(/\s+/);
        if (words.length === 0) return false;
        const emoteLike = words.filter(w => w.length > 2 && w === w.toUpperCase()).length;
        return emoteLike / words.length > threshold;
    }

    private hasBannedWords(message: string, banned: string[]): boolean {
        if (!banned.length) return false;
        const lower = message.toLowerCase();
        return banned.some(word => lower.includes(word.toLowerCase()));
    }
}

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { BotManagerService } from './bot-manager.service';
import { TwitchApiService } from './twitch-api.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { SecurityService } from '../common/security/security.service';

@Injectable()
export class RateLimiterService {
    constructor(@InjectQueue('outgoing-messages') private messageQueue: Queue) { }

    async enqueueMessage(channel: string, message: string, broadcasterId: string, botUsername: string = 'global', replyTo?: string) {
        await this.messageQueue.add('send-message', { channel, message, broadcasterId, botUsername, replyTo, type: 'chat' }, {
            removeOnComplete: true,
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000,
            },
        });
    }

    async enqueueWhisper(username: string, message: string) {
        await this.messageQueue.add('send-message', { username, message, type: 'whisper' }, {
            removeOnComplete: true,
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000,
            },
        });
    }
}

/**
 * The Processor handles the actual sending of messages.
 * Note: tmi.js handles its own internal rate limiting, but a queue 
 * gives us persistence and better control over multi-tenant fairness.
 */
@Processor('outgoing-messages')
export class MessageProcessor extends WorkerHost {
    private readonly logger = new Logger(MessageProcessor.name);

    constructor(
        @Inject(forwardRef(() => BotManagerService))
        private botManager: BotManagerService,
        private twitchApi: TwitchApiService,
        private prisma: PrismaService,
        private security: SecurityService,
    ) {
        super();
    }

    async process(job: Job<{ channel?: string, username?: string, message: string, broadcasterId?: string, botUsername?: string, replyTo?: string, type: 'chat' | 'whisper' }, any, string>): Promise<any> {
        const { channel, username, message, broadcasterId, botUsername, replyTo, type } = job.data;

        // Helix migration for the Chat Bot Badge
        if (type === 'chat' && broadcasterId && message) {
            // Use provided botUsername or fallback to global bot
            const effectiveBotUsername = botUsername || process.env.GLOBAL_BOT_USERNAME || 'streamrealmbot';
            const botInfo = await this.twitchApi.getUserInfo(effectiveBotUsername);

            if (botInfo?.id) {
                let botToken: string | undefined;

                // 1. Try to find tenant-specific bot token
                const tenant = await this.prisma.tenant.findUnique({
                    where: { twitchId: broadcasterId }
                });

                if (tenant?.botAccessToken) {
                    try {
                        botToken = this.security.decrypt(tenant.botAccessToken);
                    } catch (e) {
                        this.logger.error(`Failed to decrypt bot token for ${broadcasterId}`);
                    }
                }

                // 2. Fallback to global bot token if it matches the effectiveBotUsername
                if (!botToken && effectiveBotUsername === process.env.GLOBAL_BOT_USERNAME) {
                    botToken = process.env.GLOBAL_BOT_TOKEN?.replace('oauth:', '');
                }

                const res = await this.twitchApi.sendChatMessage(broadcasterId, botInfo.id, message, replyTo, botToken);
                if (res.success) {
                    this.logger.log(`Helix message sent successfully to ${channel} from ${effectiveBotUsername}`);
                    return { success: true, method: 'helix' };
                }
                this.logger.warn(`Helix message failed, falling back to IRC: ${res.error}`);
            } else {
                this.logger.warn(`Could not find bot ID for ${effectiveBotUsername}, falling back to IRC`);
            }
        }

        const botKey = botUsername || 'global';
        const client = this.botManager.getClient(botKey);
        if (!client) {
            this.logger.error(`No IRC client found for bot identity "${botKey}"`);
            throw new Error(`No IRC client found for ${botKey}`);
        }

        if (type === 'whisper' && username) {
            this.logger.debug(`Sending whisper to ${username}: ${message}`);
            await client.whisper(username, message);
        } else if (channel) {
            this.logger.debug(`Sending message (IRC) to ${channel} (replyTo: ${replyTo}): ${message}`);
            if (replyTo) {
                await (client as any).say(channel, message, { 'reply-parent-msg-id': replyTo });
            } else {
                await client.say(channel, message);
            }
        }

        return { success: true, method: 'irc' };
    }
}

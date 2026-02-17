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
                    this.logger.debug(`✅ Using GLOBAL_BOT_TOKEN for Helix: ${botToken ? `${botToken.substring(0, 10)}... (${botToken.length} chars)` : 'MISSING!'}`);
                } else if (!botToken) {
                    this.logger.error(`❌ No bot token found! effectiveBotUsername: ${effectiveBotUsername}, GLOBAL_BOT_USERNAME: ${process.env.GLOBAL_BOT_USERNAME}`);
                }

                this.logger.debug(`📤 Calling Helix sendChatMessage:`);
                this.logger.debug(`   broadcaster_id: ${broadcasterId}`);
                this.logger.debug(`   sender_id: ${botInfo.id}`);
                this.logger.debug(`   token: ${botToken ? 'PRESENT ✅' : 'MISSING ❌'}`);

                const res = await this.twitchApi.sendChatMessage(broadcasterId, botInfo.id, message, replyTo, botToken);

                // Auto-refresh token on 401
                if (!res.success && (res.error?.includes('401') || res.error?.includes('Unauthorized')) && tenant?.botRefreshToken) {
                    this.logger.warn(`Helix 401 Unauthorized. Attempting to refresh bot token for tenant ${tenant.id}...`);
                    try {
                        const refreshToken = this.security.decrypt(tenant.botRefreshToken);
                        const refreshResult = await this.twitchApi.refreshUserToken(refreshToken);

                        if (refreshResult) {
                            // Update DB with new tokens
                            const newEncryptedAccess = this.security.encrypt(refreshResult.accessToken);
                            const newEncryptedRefresh = this.security.encrypt(refreshResult.refreshToken);

                            await this.prisma.tenant.update({
                                where: { id: tenant.id },
                                data: {
                                    botAccessToken: newEncryptedAccess,
                                    botRefreshToken: newEncryptedRefresh
                                }
                            });

                            this.logger.log(`Bot token refreshed successfully. Retrying message...`);
                            // Retry with new token
                            const retryRes = await this.twitchApi.sendChatMessage(broadcasterId, botInfo.id, message, replyTo, refreshResult.accessToken);
                            if (retryRes.success) {
                                this.logger.log(`Helix message sent successfully (after refresh) to ${channel}`);
                                return { success: true, method: 'helix', refreshed: true };
                            } else {
                                this.logger.warn(`Retry failed: ${retryRes.error}`);
                            }
                        } else {
                            this.logger.error('Token refresh failed (invalid refresh token?)');
                        }
                    } catch (err) {
                        this.logger.error(`Failed to refresh token during retry logic`, err);
                    }
                }

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
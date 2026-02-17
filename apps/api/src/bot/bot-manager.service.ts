import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ChatHandlerService } from './chat-handler.service';
import { SecurityService } from '../common/security/security.service';
import * as tmi from 'tmi.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class BotManagerService implements OnModuleInit {
    private readonly logger = new Logger(BotManagerService.name);
    private clients: Map<string, tmi.Client> = new Map();

    constructor(
        private prisma: PrismaService,
        private chatHandler: ChatHandlerService,
        private security: SecurityService,
    ) { }

    getClient(botUsername: string = 'global'): tmi.Client | undefined {
        return this.clients.get(botUsername);
    }

    async onModuleInit() {
        this.logger.log('Initializing Bot Manager...');
        this.initializeConnections().catch(err => {
            this.logger.error('Background bot initialization failed', err);
        });
    }

    private async initializeConnections() {
        const tenants = await this.prisma.tenant.findMany({
            where: { isConnected: true },
        });
        this.logger.log(`Initializing Bot Manager with ${tenants.length} connected tenants: ${tenants.map(t => t.name).join(', ')}`);

        const globalBotUsername = process.env.GLOBAL_BOT_USERNAME || 'streamrealmbot';
        const globalBotToken = process.env.GLOBAL_BOT_TOKEN;

        // Group channels by their handling bot identity
        const botChannelGroups: Map<string, { channels: string[], identity?: any }> = new Map();

        for (const tenant of tenants as any[]) {
            let channel = (tenant.targetChannel || tenant.name || '').trim().toLowerCase();
            // Filter out obviously invalid channels (contains spaces or empty)
            if (!channel || channel.includes(' ')) {
                this.logger.warn(`Skipping invalid channel name for tenant ${tenant.name}: "${channel}"`);
                continue;
            }
            let botKey = 'global';
            let identity: any = undefined;

            if (tenant.encryptedBotAccessToken && tenant.botUsername) {
                botKey = tenant.botUsername;
                try {
                    const token = this.security.decrypt(tenant.encryptedBotAccessToken);
                    const password = token.startsWith('oauth:') ? token : `oauth:${token}`;
                    identity = {
                        username: tenant.botUsername,
                        password,
                    };
                } catch (err) {
                    this.logger.error(`Failed to decrypt bot token for ${tenant.name}`, err);
                }
            } else if (globalBotUsername && globalBotToken) {
                const password = globalBotToken.startsWith('oauth:') ? globalBotToken : `oauth:${globalBotToken}`;
                this.logger.warn(`Debug: Global Bot Identity - Username: ${globalBotUsername}, Password Provided: [REDACTED]`);
                identity = {
                    username: globalBotUsername,
                    password,
                };
            }

            const formattedChannel = channel.startsWith('#') ? channel : `#${channel}`;
            if (!botChannelGroups.has(botKey)) {
                botChannelGroups.set(botKey, { channels: [], identity });
            }
            botChannelGroups.get(botKey)!.channels.push(formattedChannel);
        }

        // Initialize or Update Clients
        for (const [botKey, group] of botChannelGroups.entries()) {
            let client = this.clients.get(botKey);

            if (!client) {
                this.logger.log(`Creating bot client [${botKey}] for channels: ${group.channels.join(', ')}`);
                client = new tmi.Client({
                    options: { debug: true },
                    connection: {
                        reconnect: true,
                        server: 'irc-ws.chat.twitch.tv',
                        port: 443,
                        secure: true
                    },
                    identity: group.identity,
                    channels: group.channels,
                });

                client.on('message', (ch, userstate, message, self) => {
                    this.logger.debug(`[EVENT:message] ${userstate.username} in ${ch} (self: ${self})`);
                    if (self) return;
                    this.chatHandler.handleMessage(ch.replace('#', ''), userstate, message, client!);
                });

                client.on('chat', (ch, userstate, message, self) => {
                    this.logger.debug(`[EVENT:chat] ${userstate.username} in ${ch}`);
                });

                client.on('join', (ch, user, self) => {
                    this.logger.log(`[EVENT:join] ${user} joined ${ch} (self: ${self})`);
                    if (self && client) {
                        client.say(ch, "StreamRealm Bot joined successfully!").catch(e => this.logger.error(`SAY FAIL in ${ch}`, e));
                    }
                });

                client.on('notice', (ch, msgid, msg) => {
                    this.logger.warn(`[EVENT:notice] ${ch}: [${msgid}] ${msg}`);
                });

                client.on('raw_message', (msg) => {
                    // Log important command responses if needed
                    if (msg.command === 'NOTICE') {
                        this.logger.warn(`[RAW:NOTICE] ${msg.raw}`);
                    }
                });

                try {
                    this.logger.log(`Bot [${botKey}] attempting to connect...`);
                    client.on('connected', (addr, port) => {
                        this.logger.log(`Bot [${botKey}] connected to ${addr}:${port}`);
                        (client as any).raw('CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands');
                    });

                    if (!group.identity?.password) {
                        this.logger.warn(`Bot [${botKey}] has no password/token. Skipping connection.`);
                        continue;
                    }

                    await client.connect();
                    this.clients.set(botKey, client);
                    this.logger.log(`Bot [${botKey}] connected successfully!`);
                } catch (err) {
                    const errorDetail = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
                    this.logger.error(`Failed to connect Bot [${botKey}]: ${errorDetail}`);

                    // If this is the global bot and auth failed, try refreshing the token
                    if (botKey === 'global' && errorDetail.includes('Login authentication failed')) {
                        this.logger.warn('Global bot authentication failed. Attempting token refresh...');
                        try {
                            await this.refreshGlobalBotToken();
                            this.logger.log('✅ Token refreshed successfully. Restart the server to reconnect.');
                        } catch (refreshErr) {
                            this.logger.error('❌ Token refresh failed:', refreshErr);
                        }
                    }
                }
            } else {
                for (const ch of group.channels) {
                    if (!client.getChannels().includes(ch)) {
                        await client.join(ch);
                    }
                }
            }
        }
    }

    async joinChannel(channelName: string) {
        this.logger.log(`Attempting to join channel: ${channelName}`);
        const client = this.clients.get('global') || Array.from(this.clients.values())[0];
        if (client) {
            try {
                const formattedChannel = channelName.startsWith('#') ? channelName : `#${channelName}`;
                if (!client.getChannels().includes(formattedChannel)) {
                    await client.join(channelName);
                    this.logger.log(`Successfully joined ${formattedChannel}`);
                }
            } catch (err) {
                this.logger.error(`Failed to join ${channelName}`, err);
            }
        }
    }

    async leaveChannel(channelName: string) {
        this.logger.log(`Attempting to leave channel: ${channelName}`);
        const client = this.clients.get('global') || Array.from(this.clients.values())[0];
        if (client) {
            try {
                const formattedChannel = channelName.startsWith('#') ? channelName : `#${channelName}`;
                if (client.getChannels().includes(formattedChannel)) {
                    await client.part(channelName);
                    this.logger.log(`Successfully left ${formattedChannel}`);
                }
            } catch (err) {
                this.logger.error(`Failed to leave ${channelName}`, err);
            }
        }
    }

    private async refreshGlobalBotToken(): Promise<void> {
        this.logger.log('Executing token refresh script...');
        try {
            const { stdout, stderr } = await execAsync('node refresh-bot-token.js', {
                cwd: process.cwd().replace(/apps[\\/]api$/, '')
            });
            if (stdout) this.logger.log(stdout);
            if (stderr) this.logger.error(stderr);
        } catch (err) {
            this.logger.error('Failed to execute refresh script:', err);
            throw err;
        }
    }
}

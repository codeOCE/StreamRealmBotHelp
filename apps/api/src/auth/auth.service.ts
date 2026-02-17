import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SecurityService } from '../common/security/security.service';
import { BotManagerService } from '../bot/bot-manager.service';


@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private security: SecurityService,
        private botManager: BotManagerService,
    ) { }

    async validateUser(profile: any, accessToken: string, refreshToken: string) {
        try {
            const { id: twitchId, login: username, email } = profile;

            const encryptedAccessToken = this.security.encrypt(accessToken);
            const encryptedRefreshToken = this.security.encrypt(refreshToken);

            // Token expiry is usually 4 hours for Twitch
            const tokenExpiresAt = new Date();
            tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 4);

            // Upsert User (Streamer / Owner)
            const user = await this.prisma.user.upsert({
                where: { twitchId },
                update: {
                    username,
                    email,
                    encryptedAccessToken,
                    encryptedRefreshToken,
                    tokenExpiresAt,
                },
                create: {
                    twitchId,
                    username,
                    email,
                    encryptedAccessToken,
                    encryptedRefreshToken,
                    tokenExpiresAt,
                },
            });

            // Ensure Tenant exists, and set targetChannel to the user's login by default
            const tenant = await this.prisma.tenant.upsert({
                where: { twitchId },
                update: {
                    name: username,
                    isConnected: true,
                    targetChannel: username, // Default target is the owner's channel
                } as any,
                create: {
                    ownerId: user.id,
                    twitchId,
                    name: username,
                    isConnected: true,
                    targetChannel: username,
                } as any,
            });

            // Seed default commands if none exist for this tenant
            const commandCount = await this.prisma.command.count({ where: { tenantId: tenant.id } });
            if (commandCount === 0) {
                const defaultCommands = [
                    // Custom example commands
                    { trigger: 'hello', responses: ['Hello @{user}! Welcome to the stream!'], responseType: 'SAY', isBuiltIn: false, description: 'Greet viewers' },
                    { trigger: 'rules', responses: ['Keep it friendly and respectful. No spamming or self-promo!'], responseType: 'SAY', isBuiltIn: false, description: 'Display chat rules' },

                    // Built-in utility commands
                    { trigger: 'help', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Show available commands' },
                    { trigger: 'commands', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Show available commands' },
                    { trigger: 'ping', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Test bot responsiveness' },
                    { trigger: 'uptime', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Show stream uptime' },
                    { trigger: 'game', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Show current game' },
                    { trigger: 'title', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Show stream title' },

                    // Social commands
                    { trigger: 'socials', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Display social media links' },
                    { trigger: 'shoutout', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Give a shoutout to another streamer' },
                    { trigger: 'so', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Shoutout alias' },

                    // Viewer stats commands
                    { trigger: 'stats', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Show viewer stats' },
                    { trigger: 'xp', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Show XP and level' },
                    { trigger: 'top', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Show top viewers' },
                    { trigger: 'leaderboard', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Show XP leaderboard' },
                    { trigger: 'watchtime', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Show watch time' },
                    { trigger: 'followage', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Show how long you\'ve been following' },

                    // Battle system commands
                    { trigger: 'battle', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Challenge another viewer to a battle' },
                    { trigger: 'accept', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Accept a battle challenge' },
                    { trigger: 'decline', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Decline a battle challenge' },

                    // Fun commands
                    { trigger: '8ball', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Ask the magic 8-ball' },
                    { trigger: 'dadjoke', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Get a random dad joke' },
                    { trigger: 'fact', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Get a random fact' },

                    // Command management (mod only)
                    { trigger: 'addcom', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Add a custom command (mod only)' },
                    { trigger: 'delcom', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Delete a custom command (mod only)' },
                    { trigger: 'editcom', responses: [], responseType: 'SAY', isBuiltIn: true, description: 'Edit a custom command (mod only)' },
                ];

                for (const cmd of defaultCommands) {
                    await this.prisma.command.create({
                        data: {
                            tenantId: tenant.id,
                            trigger: cmd.trigger,
                            responses: cmd.responses,
                            isBuiltIn: cmd.isBuiltIn,
                            enabled: true,
                            description: cmd.description,
                            responseType: (cmd.responseType as any),
                        }
                    });
                }
            }

            // Trigger bot to join the target channel immediately
            await this.botManager.joinChannel(username);

            return user;
        } catch (err) {
            console.error('CRITICAL ERROR in validateUser:', err);
            throw err;
        }
    }

    async validateBot(ownerTwitchId: string, profile: any, accessToken: string, refreshToken: string) {
        const { login: botUsername } = profile;

        const encryptedAccessToken = this.security.encrypt(accessToken);
        const encryptedRefreshToken = this.security.encrypt(refreshToken);

        // Update the Tenant with bot credentials
        const tenant = await this.prisma.tenant.update({
            where: { twitchId: ownerTwitchId },
            data: {
                botUsername,
                botAccessToken: encryptedAccessToken,
                botRefreshToken: encryptedRefreshToken,
            } as any,
        });

        // Trigger bot to join the target channel with its NEW identity
        await this.botManager.joinChannel((tenant as any).targetChannel || tenant.name);

        return tenant;
    }
}

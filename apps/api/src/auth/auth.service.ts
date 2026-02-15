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
                    { trigger: 'hello', responses: ['Hello @{user}! Welcome to the stream!'], responseType: 'SAY', isBuiltIn: false },
                    { trigger: 'rules', responses: ['Keep it friendly and respectful. No spamming or self-promo!'], responseType: 'SAY', isBuiltIn: false },
                    { trigger: 'shoutout', responses: [], responseType: 'SAY', isBuiltIn: true },
                    { trigger: 'so', responses: [], responseType: 'SAY', isBuiltIn: true },
                    { trigger: '8ball', responses: [], responseType: 'SAY', isBuiltIn: true },
                    { trigger: 'dadjoke', responses: [], responseType: 'SAY', isBuiltIn: true },
                    { trigger: 'fact', responses: [], responseType: 'SAY', isBuiltIn: true },
                    { trigger: 'addcom', responses: [], responseType: 'SAY', isBuiltIn: true },
                    { trigger: 'delcom', responses: [], responseType: 'SAY', isBuiltIn: true },
                    { trigger: 'editcom', responses: [], responseType: 'SAY', isBuiltIn: true },
                ];

                for (const cmd of defaultCommands) {
                    await this.prisma.command.create({
                        data: {
                            tenantId: tenant.id,
                            trigger: cmd.trigger,
                            responses: cmd.responses,
                            isBuiltIn: cmd.isBuiltIn,
                            enabled: true,
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

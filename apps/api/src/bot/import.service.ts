import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import axios from 'axios';
import { UserLevel } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ImportService {
    private readonly logger = new Logger(ImportService.name);

    constructor(private prisma: PrismaService) { }

    async fetchStreamElementsCommands(token: string) {
        try {
            // StreamElements API endpoint for commands
            // Note: In a real scenario, we'd need the channel ID, but the JWT usually allows access to the user's channel.
            // We might need to fetch the channel profile first to get the channel ID if the commands endpoint requires it.
            // For now, let's assume we can hit the 'channels/me' to get ID, then fetch commands.

            const profileRes = await axios.get('https://api.streamelements.com/kappa/v2/channels/me', {
                headers: { Authorization: `Bearer ${token}` }
            });

            const channelId = profileRes.data._id;

            const commandsRes = await axios.get(`https://api.streamelements.com/kappa/v2/bot/commands/${channelId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            return commandsRes.data.map((cmd: any) => ({
                command: cmd.command,
                reply: cmd.reply,
                enabled: cmd.enabled,
                // StreamElements specific fields we might want to map or store
                cooldown: cmd.cooldown?.global || 0,
                userLevel: cmd.accessLevel || 'all'
            }));

        } catch (error) {
            this.logger.error(`Failed to fetch SE commands: ${error.message}`);
            throw new Error("Failed to authenticate with StreamElements or fetch commands.");
        }
    }

    async processImport(tenantId: string, provider: string, commands: any[]) {
        let imported = 0;
        let failed = 0;
        let skipped = 0;
        const failedCommands: string[] = [];

        for (const cmd of commands) {
            try {
                // Ensure trigger starts with !
                let trigger = cmd.trigger || cmd.command || cmd.name;

                if (!trigger) {
                    throw new Error(`Command missing trigger: ${JSON.stringify(cmd)}`);
                }

                // Sanitize trigger: Ensure exactly one '!' at the start
                trigger = '!' + trigger.replace(/^!+/, '');

                // Check if command already exists
                const existing = await this.prisma.command.findFirst({
                    where: { tenantId, trigger }
                });

                if (existing) {
                    skipped++;
                    continue;
                }

                // Map user level
                let userLevel: UserLevel = UserLevel.VIEWER;
                const level = (cmd.userLevel || 'viewer').toLowerCase();
                if (level === 'moderator' || level === 'mod') userLevel = UserLevel.MODERATOR;
                else if (level === 'vip') userLevel = UserLevel.VIP;
                else if (level === 'subscriber' || level === 'sub') userLevel = UserLevel.SUBSCRIBER;
                else if (level === 'broadcaster' || level === 'owner') userLevel = UserLevel.BROADCASTER;

                // Create command
                await this.prisma.command.create({
                    data: {
                        tenantId,
                        trigger,
                        responses: cmd.responses || [cmd.response || cmd.reply || ''],
                        enabled: cmd.enabled ?? true, // Default to true if missing
                        description: cmd.description || `Imported from ${provider}`,
                        isBuiltIn: false,
                        userLevel,
                        cooldown: cmd.cooldown || 0,
                    }
                });

                imported++;
            } catch (error: any) {
                const logPath = path.join(process.cwd(), 'import-debug.log');
                const logEntry = `[${new Date().toISOString()}] Error importing command: ${error.message}\nCommand: ${JSON.stringify(cmd)}\nStack: ${error.stack}\n\n`;
                // Append asynchronously to avoid blocking loop if possible, or sync for simplicity
                try { fs.appendFileSync(logPath, logEntry); } catch (e) { console.error('Failed to write log', e); }

                this.logger.error(`Failed to import command ${cmd.trigger}: ${error.message}`);
                failed++;
                failedCommands.push(`${cmd.trigger || 'unknown'}: ${error.message}`);
            }
        }

        return { imported, skipped, failed, failedCommands };
    }
}

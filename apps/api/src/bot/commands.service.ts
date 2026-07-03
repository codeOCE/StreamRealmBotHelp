import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from './audit.service';
import { UserLevel } from '../common/enums';
import { VariableService } from './variable.service';
import { BotEventsGateway } from './bot-events.gateway';

@Injectable()
export class CommandsService {
    constructor(
        private prisma: PrismaService,
        private auditService: AuditService,
        private variableService: VariableService,
        private events: BotEventsGateway
    ) { }

    private readonly builtInDefaults = [
        { trigger: 'uptime', category: 'Streaming', description: 'Shows how long the stream has been live.', userLevel: 'VIEWER' as UserLevel, cooldown: 10, userCooldown: 5, responses: '[]' },
        { trigger: 'game', category: 'Streaming', description: 'Shows the current game being played.', userLevel: 'VIEWER' as UserLevel, cooldown: 10, userCooldown: 5, responses: '[]' },
        { trigger: 'title', category: 'Streaming', description: 'Shows the current stream title.', userLevel: 'VIEWER' as UserLevel, cooldown: 10, userCooldown: 5, responses: '[]' },

        { trigger: 'stats', category: 'Loyalty', description: 'Displays your XP, Level, and Watchtime.', userLevel: 'VIEWER' as UserLevel, cooldown: 15, userCooldown: 30, responses: '[]' },
        { trigger: 'xp', category: 'Loyalty', description: 'Alias for !stats.', userLevel: 'VIEWER' as UserLevel, cooldown: 15, userCooldown: 30, responses: '[]' },
        { trigger: 'top', category: 'Loyalty', description: 'Shows the top XP leaderboard.', userLevel: 'VIEWER' as UserLevel, cooldown: 30, userCooldown: 60, responses: '[]' },
        { trigger: 'leaderboard', category: 'Loyalty', description: 'Alias for !top.', userLevel: 'VIEWER' as UserLevel, cooldown: 30, userCooldown: 60, responses: '[]' },
        { trigger: 'watchtime', category: 'Loyalty', description: 'Shows how much time you have spent in the stream.', userLevel: 'VIEWER' as UserLevel, cooldown: 15, userCooldown: 30, responses: '[]' },
        { trigger: 'followage', category: 'Loyalty', description: 'Shows long you have been following the channel.', userLevel: 'VIEWER' as UserLevel, cooldown: 15, userCooldown: 30, responses: '[]' },

        { trigger: 'socials', category: 'Utility', description: 'Displays links to social media profiles.', userLevel: 'VIEWER' as UserLevel, cooldown: 20, userCooldown: 60, responses: '[]' },
        { trigger: 'commands', category: 'Utility', description: 'Lists all available commands.', userLevel: 'VIEWER' as UserLevel, cooldown: 30, userCooldown: 10, responses: '[]' },
        { trigger: 'help', category: 'Utility', description: 'Alias for !commands.', userLevel: 'VIEWER' as UserLevel, cooldown: 30, userCooldown: 10, responses: '[]' },
        { trigger: 'ping', category: 'Utility', description: 'Check if the bot is online.', userLevel: 'VIEWER' as UserLevel, cooldown: 5, userCooldown: 10, responses: '[]' },

        { trigger: 'shoutout', category: 'Moderation', description: 'Give a shoutout to another streamer.', userLevel: 'MODERATOR' as UserLevel, cooldown: 0, userCooldown: 0, responses: '[]' },
        { trigger: 'so', category: 'Moderation', description: 'Alias for !shoutout.', userLevel: 'MODERATOR' as UserLevel, cooldown: 0, userCooldown: 0, responses: '[]' },
        { trigger: 'addcom', category: 'Moderation', description: 'Add a new custom command from chat.', userLevel: 'MODERATOR' as UserLevel, cooldown: 0, userCooldown: 0, responses: '[]' },
        { trigger: 'editcom', category: 'Moderation', description: 'Edit an existing custom command from chat.', userLevel: 'MODERATOR' as UserLevel, cooldown: 0, userCooldown: 0, responses: '[]' },
        { trigger: 'delcom', category: 'Moderation', description: 'Delete a custom command from chat.', userLevel: 'MODERATOR' as UserLevel, cooldown: 0, userCooldown: 0, responses: '[]' },
        { trigger: 'permit', category: 'Moderation', description: 'Permit a user to post links.', userLevel: 'MODERATOR' as UserLevel, cooldown: 0, userCooldown: 0, responses: '[]' },
    ];

    async findAll(tenantId: string) {
        // Ensure built-ins exist
        await this.initializeBuiltIns(tenantId);

        const commands = await this.prisma.command.findMany({
            where: { tenantId },
            orderBy: { trigger: 'asc' }
        });

        return commands.map(cmd => this.mapCommand(cmd));
    }

    private mapCommand(cmd: any) {
        if (!cmd) return cmd;
        try {
            return {
                ...cmd,
                responses: typeof cmd.responses === 'string' ? JSON.parse(cmd.responses) : (cmd.responses || []),
                aliases: typeof cmd.aliases === 'string' ? JSON.parse(cmd.aliases) : (cmd.aliases || []),
            };
        } catch (e) {
            return {
                ...cmd,
                responses: Array.isArray(cmd.responses) ? cmd.responses : [cmd.responses],
                aliases: Array.isArray(cmd.aliases) ? cmd.aliases : [],
            };
        }
    }

    private async initializeBuiltIns(tenantId: string) {
        for (const def of this.builtInDefaults) {
            await this.prisma.command.upsert({
                where: {
                    tenantId_trigger: {
                        tenantId,
                        trigger: def.trigger,
                    },
                },
                update: {
                    isBuiltIn: true,
                    description: def.description,
                    category: def.category,
                },
                create: {
                    ...def,
                    tenantId,
                    isBuiltIn: true,
                    enabled: true,
                },
            });
        }
    }

    async create(tenantId: string, data: { trigger: string; responses: any; responseType?: any; aliases?: any; cooldown: number; userCooldown?: number; userLevel: UserLevel; description?: string; category?: string; isRegex?: boolean }) {
        // Automatically normalize external syntax (SE, etc)
        const normalizedResponses = Array.isArray(data.responses)
            ? data.responses.map(r => this.variableService.normalizeSyntax(r))
            : this.variableService.normalizeSyntax(data.responses as any);

        const cmd = await this.prisma.command.create({
            data: {
                ...data,
                responses: JSON.stringify(normalizedResponses),
                aliases: data.aliases ? JSON.stringify(data.aliases) : '[]',
                tenantId,
                isBuiltIn: false,
                category: data.category || 'General',
                userCooldown: data.userCooldown || 0,
                isRegex: data.isRegex || false,
            },
        });

        await this.auditService.log({
            tenantId,
            action: 'COMMAND_ADD',
            actor: 'Dashboard',
            target: `!${cmd.trigger}`,
            metadata: { response: cmd.responses }
        });

        this.events.emitCommandUpdate(tenantId);
        return this.mapCommand(cmd);
    }

    async update(id: string, data: { trigger?: string; responses?: any; responseType?: any; aliases?: any; usages?: number; cooldown?: number; userCooldown?: number; userLevel?: UserLevel; enabled?: boolean; description?: string; category?: string; isRegex?: boolean }) {
        // Automatically normalize external syntax (SE, etc) if responses are being updated
        if (data.responses) {
            data.responses = Array.isArray(data.responses)
                ? data.responses.map(r => this.variableService.normalizeSyntax(r))
                : this.variableService.normalizeSyntax(data.responses as any);
        }

        const cmd = await this.prisma.command.update({
            where: { id },
            data: {
                ...data,
                responses: data.responses ? JSON.stringify(data.responses) : undefined,
                aliases: data.aliases ? JSON.stringify(data.aliases) : undefined,
            },
        });

        await this.auditService.log({
            tenantId: cmd.tenantId,
            action: 'COMMAND_EDIT',
            actor: 'Dashboard',
            target: `!${cmd.trigger}`,
            metadata: { data }
        });

        this.events.emitCommandUpdate(cmd.tenantId);
        return this.mapCommand(cmd);
    }

    async delete(id: string) {
        // Prevent deletion of built-in commands (they should only be disabled)
        const command = await this.prisma.command.findUnique({ where: { id } });
        if ((command as any)?.isBuiltIn) {
            throw new Error('Built-in commands cannot be deleted, only disabled.');
        }

        const res = await this.prisma.command.delete({
            where: { id },
        });

        await this.auditService.log({
            tenantId: res.tenantId,
            action: 'COMMAND_DELETE',
            actor: 'Dashboard',
            target: `!${res.trigger}`
        });

        this.events.emitCommandUpdate(res.tenantId);
        return res;
    }

    async importBulk(tenantId: string, commands: any[]) {
        const results = {
            imported: 0,
            skipped: 0,
            failed: 0,
            failedCommands: [] as string[]
        };

        for (const rawCmd of commands) {
            try {
                // Basic validation
                if (!rawCmd.trigger || !rawCmd.responses) {
                    results.skipped++;
                    continue;
                }

                const trigger = rawCmd.trigger.toLowerCase().replace('!', '');

                // Check if already exists
                const existing = await this.prisma.command.findUnique({
                    where: {
                        tenantId_trigger: {
                            tenantId,
                            trigger
                        }
                    }
                });

                if (existing) {
                    results.skipped++;
                    continue;
                }

                // Normalize syntax
                const normalizedResponses = Array.isArray(rawCmd.responses)
                    ? rawCmd.responses.map((r: string) => this.variableService.normalizeSyntax(r))
                    : [this.variableService.normalizeSyntax(rawCmd.responses as string)];

                // Map user level
                let userLevel: UserLevel = UserLevel.VIEWER;
                const reqLevel = (rawCmd.userLevel || 'viewer').toString().toLowerCase();
                if (reqLevel === 'moderator' || reqLevel === 'mod') userLevel = UserLevel.MODERATOR;
                else if (reqLevel === 'vip') userLevel = UserLevel.VIP;
                else if (reqLevel === 'subscriber' || reqLevel === 'sub') userLevel = UserLevel.SUBSCRIBER;
                else if (reqLevel === 'broadcaster' || reqLevel === 'owner') userLevel = UserLevel.BROADCASTER;

                await this.prisma.command.create({
                    data: {
                        tenantId,
                        trigger,
                        responses: JSON.stringify(normalizedResponses),
                        aliases: rawCmd.aliases ? JSON.stringify(rawCmd.aliases) : '[]',
                        description: rawCmd.description || `Imported from ${rawCmd.source || 'external bot'}`,
                        category: rawCmd.category || 'Imported',
                        userLevel: userLevel,
                        cooldown: rawCmd.cooldown || 10,
                        userCooldown: rawCmd.userCooldown || 5, // Default user cooldown
                        enabled: true,
                        isBuiltIn: false,
                        isRegex: false // Default for imported commands
                    }
                });

                results.imported++;
            } catch (err: any) {
                console.error(`Failed to import command: ${rawCmd.trigger}`, err);
                results.failed++;
                results.failedCommands.push(`${rawCmd.trigger}: ${err.message}`);
            }
        }

        await this.auditService.log({
            tenantId,
            action: 'COMMAND_IMPORT',
            actor: 'Dashboard',
            target: `${results.imported} commands`,
            metadata: { results }
        });

        this.events.emitCommandUpdate(tenantId);
        return results;
    }

    async deleteAll(tenantId: string) {
        const count = await this.prisma.command.deleteMany({
            where: {
                tenantId,
                isBuiltIn: false
            }
        });

        await this.auditService.log({
            tenantId,
            action: 'COMMAND_BULK_DELETE',
            actor: 'Dashboard',
            metadata: { count: count.count }
        });

        this.events.emitCommandUpdate(tenantId);
        return count;
    }
}

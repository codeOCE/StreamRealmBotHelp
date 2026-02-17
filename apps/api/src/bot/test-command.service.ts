import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { VariableService } from './variable.service';
import { TwitchApiService } from './twitch-api.service';

export interface SimulationResult {
    response: string | null;
    logs: string[];
    variables: Record<string, any>;
    success: boolean;
}

@Injectable()
export class TestCommandService {
    private readonly logger = new Logger(TestCommandService.name);

    constructor(
        private prisma: PrismaService,
        private variableService: VariableService,
        private twitchApiService: TwitchApiService,
    ) { }

    async simulate(tenantId: string, trigger: string, message: string, userContext: any): Promise<SimulationResult> {
        const logs: string[] = [];
        logs.push(`[SIM] Starting simulation for trigger: "${trigger}"`);

        // Check 1: Built-in Commands (Replicated Logic)
        const builtInRes = await this.simulateBuiltIn(tenantId, trigger, message, userContext, logs);
        if (builtInRes) {
            return {
                response: builtInRes,
                logs,
                variables: userContext,
                success: true
            };
        }

        // Check 2: Custom Commands
        logs.push(`[SIM] Searching DB for custom command: "${trigger}"`);
        const command = await (this.prisma as any).command.findFirst({
            where: {
                tenantId,
                enabled: true,
                OR: [
                    { trigger },
                    { aliases: { path: [], array_contains: trigger } as any }
                ]
            }
        });

        if (!command) {
            logs.push(`[SIM] Command "${trigger}" not found.`);
            return {
                response: null,
                logs,
                variables: userContext,
                success: false
            };
        }

        logs.push(`[SIM] Found command ID: ${command.id}`);

        // Context
        // userContext passed from frontend should match structure expected by VariableService
        // but let's ensure defaults
        const context = {
            user: userContext.username || 'TestUser',
            userId: userContext.userId || '12345',
            channel: userContext.channel || 'test_channel',
            broadcasterId: userContext.broadcasterId || '96085876', // Default to dev ID
            count: command.usages || 0, // Use current usage count (mocked?)
            args: message.split(' ').slice(1),
            msgId: 'test-msg-id-123'
        };

        const resData = (command as any).responses;
        let responseTemplate = '';

        if (Array.isArray(resData)) {
            responseTemplate = resData[0]; // Just take first for simulation
        } else if (typeof resData === 'string') {
            responseTemplate = resData;
        }

        logs.push(`[SIM] Parsing response template: "${responseTemplate}"`);

        try {
            const parsed = await this.variableService.parse(responseTemplate, context);
            logs.push(`[SIM] Parsed result: "${parsed}"`);

            return {
                response: parsed,
                logs,
                variables: context,
                success: true
            };
        } catch (error: any) {
            logs.push(`[SIM] Error parsing variables: ${error.message}`);
            return {
                response: null,
                logs,
                variables: context,
                success: false
            };
        }
    }

    private async simulateBuiltIn(tenantId: string, trigger: string, message: string, userContext: any, logs: string[]): Promise<string | null> {
        // Fetch tenant for botUsername context
        const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) return null;

        const channelName = (tenant as any).targetChannel || 'test_channel';

        switch (trigger) {
            case 'uptime':
                logs.push('[SIM] Executing built-in: !uptime');
                const stream = await this.twitchApiService.getStreamInfo(channelName);
                if (stream) {
                    return `🎮 Stream has been live since ${stream.started_at}`;
                }
                return '🔴 Stream is currently offline.';

            case 'ping':
                logs.push('[SIM] Executing built-in: !ping');
                return '🏓 Pong! StreamRealm Bot is online in Simulation Mode.';

            case '8ball':
                logs.push('[SIM] Executing built-in: !8ball');
                const answers = ['Yes', 'No', 'Maybe', 'Outlook good'];
                return `🎱 ${answers[Math.floor(Math.random() * answers.length)]}`;

            case 'coinflip':
                logs.push('[SIM] Executing built-in: !coinflip');
                return Math.random() > 0.5 ? '🪙 Heads' : '🪙 Tails';

            default:
                return null;
        }
    }
}

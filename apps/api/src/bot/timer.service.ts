import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RateLimiterService } from './rate-limiter.service';
import { VariableService } from './variable.service';

interface TimerState {
    lastFiredAt: number;
    messageCount: number;
}

@Injectable()
export class TimerService {
    private readonly logger = new Logger(TimerService.name);
    private state: Map<string, Map<string, TimerState>> = new Map(); // tenantId -> timerName -> state

    constructor(
        private prisma: PrismaService,
        private rateLimiter: RateLimiterService,
        private variableService: VariableService
    ) { }

    async handleMessage(tenantTwitchId: string, channelName: string) {
        const tenant = await this.prisma.tenant.findUnique({ where: { twitchId: tenantTwitchId } });
        if (!tenant) return;

        const tenantId = tenant.id;
        const timers = await this.prisma.timer.findMany({
            where: { tenantId, enabled: true }
        });

        if (timers.length === 0) return;

        if (!this.state.has(tenantId)) {
            this.state.set(tenantId, new Map());
        }

        const tenantState = this.state.get(tenantId)!;
        const now = Date.now();

        for (const timer of timers) {
            let timerState = tenantState.get(timer.name);
            if (!timerState) {
                timerState = { lastFiredAt: now, messageCount: 0 };
                tenantState.set(timer.name, timerState);
            }

            timerState.messageCount++;

            const timeDiff = (now - timerState.lastFiredAt) / 1000;

            if (timeDiff >= timer.intervalSeconds && timerState.messageCount >= timer.minMessages) {
                await this.fireTimer(timer, channelName, tenant.twitchId);

                // Reset state
                timerState.lastFiredAt = now;
                timerState.messageCount = 0;
            }
        }
    }

    private async fireTimer(timer: any, channelName: string, broadcasterId: string) {
        try {
            const context = {
                user: 'System',
                userId: 'system',
                channel: channelName,
                broadcasterId: broadcasterId,
                count: 0,
                args: []
            };

            const parsedMessage = await this.variableService.parse(timer.message, context);
            await this.rateLimiter.enqueueMessage(channelName, parsedMessage, broadcasterId, timer.tenant.botUsername || 'global');
            this.logger.log(`[Timer] Fired timer "${timer.name}" in ${channelName}`);
        } catch (err) {
            this.logger.error(`Failed to fire timer "${timer.name}"`, err);
        }
    }
}

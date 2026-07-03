import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../common/prisma/prisma.service';
import { BotManagerService } from './bot-manager.service';
import { VariableService } from './variable.service';
import { SchedulerRegistry } from '@nestjs/schedule';

@Injectable()
export class TimerService implements OnModuleInit {
    private readonly logger = new Logger(TimerService.name);
    // Map<tenantId, Map<timerId, Interval>>
    private intervals: Map<string, Map<string, NodeJS.Timeout>> = new Map();
    // Map<tenantId, messageCount>
    private chatLines: Map<string, number> = new Map();

    constructor(
        private prisma: PrismaService,
        private moduleRef: ModuleRef,
        private variableService: VariableService,
        private schedulerRegistry: SchedulerRegistry,
    ) { }

    async onModuleInit() {
        // Load all active timers on startup?
        // Or load per tenant when they come online? 
        // For now, load all for connected tenants.
        this.loadAllTimers();
    }

    private get botManager(): BotManagerService {
        return this.moduleRef.get(BotManagerService, { strict: false });
    }

    async loadAllTimers() {
        const tenants = await this.prisma.tenant.findMany({
            where: { isConnected: true }
        });

        for (const tenant of tenants) {
            await this.startTimers(tenant.id);
        }
    }

    async startTimers(tenantId: string) {
        this.stopTimers(tenantId);

        const timers = await (this.prisma as any).timer.findMany({
            where: { tenantId, enabled: true }
        });

        if (!timers.length) return;

        const tenantIntervals = new Map<string, NodeJS.Timeout>();
        this.intervals.set(tenantId, tenantIntervals);

        for (const timer of timers) {
            if (timer.intervalSeconds < 60) timer.intervalSeconds = 60; // Minimum 1 minute safety

            const interval = setInterval(() => {
                this.handleTimer(tenantId, timer);
            }, timer.intervalSeconds * 1000);

            tenantIntervals.set(timer.id, interval);
        }

        this.logger.log(`Started ${timers.length} timers for tenant ${tenantId}`);
    }

    stopTimers(tenantId: string) {
        const tenantIntervals = this.intervals.get(tenantId);
        if (tenantIntervals) {
            for (const interval of tenantIntervals.values()) {
                clearInterval(interval);
            }
            this.intervals.delete(tenantId);
        }
    }

    async reloadTimers(tenantId: string) {
        await this.startTimers(tenantId);
    }

    async handleMessage(tenantId: string, channelName: string) {
        this.incrementChatLines(tenantId);
    }

    incrementChatLines(tenantId: string) {
        const current = this.chatLines.get(tenantId) || 0;
        this.chatLines.set(tenantId, current + 1);
    }

    private async handleTimer(tenantId: string, timer: any) {
        // Check chat lines condition
        const currentLines = this.chatLines.get(tenantId) || 0;
        if (currentLines < timer.chatLines) {
            // Not enough lines, skip this tick
            return;
        }

        // Reset lines count? 
        // Usually, timers consume the lines, OR they just check "X lines since last timer".
        // A simple "global line count" approach resets on every timer fire? relative?
        // Let's go with: Reset lines after firing.
        this.chatLines.set(tenantId, 0);

        try {
            // Get Tenant to know channel name
            const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
            if (!tenant || !tenant.isConnected) return;

            // Parse variables
            const message = await this.variableService.parse(timer.message, {
                user: 'StreamPulse',
                userId: 'bot',
                channel: tenant.name,
                broadcasterId: tenant.twitchId,
                count: 0,
                args: []
            });

            // Send via BotManager
            const botUsername = tenant.botUsername || 'global'; // Or however we determine which bot handles this tenant
            const client = this.botManager.getClient(botUsername);

            if (client) {
                // Determine channel name with #
                const channel = tenant.targetChannel || tenant.name;
                const target = channel.startsWith('#') ? channel : `#${channel}`;
                await client.say(target, message);
                this.logger.log(`[Timer] Sent message to ${target}: ${message}`);
            } else {
                this.logger.warn(`[Timer] No client found for ${botUsername} (Tenant: ${tenant.name})`);
            }

        } catch (error) {
            this.logger.error(`Failed to execute timer ${timer.name} for ${tenantId}`, error);
        }
    }
}

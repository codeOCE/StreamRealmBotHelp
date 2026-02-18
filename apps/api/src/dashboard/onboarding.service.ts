import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class OnboardingService {
    private readonly logger = new Logger(OnboardingService.name);

    constructor(private prisma: PrismaService) { }

    async getStatus(tenantId: string) {
        let status = await this.prisma.onboarding.findUnique({
            where: { tenantId },
            include: { tenant: true } // Include tenant for checks
        });

        if (!status) {
            status = await this.prisma.onboarding.create({
                data: { tenantId },
                include: { tenant: true }
            });
        }

        // --- Auto-Detection Logic ---
        const updates: any = {};

        // 1. Check Linked Bot
        if (!status.hasLinkedBot && status.tenant?.isConnected) {
            updates.hasLinkedBot = true;
        }

        // 2. Check Created Command
        if (!status.hasCreatedCommand) {
            const commandCount = await this.prisma.command.count({
                where: { tenantId, isBuiltIn: false }
            });
            if (commandCount > 0) updates.hasCreatedCommand = true;
        }

        // 3. Check Moderation (Assuming at least one rule enabled)
        if (!status.hasEnabledModeration) {
            const modCount = await this.prisma.modRule.count({
                where: { tenantId, enabled: true }
            });
            if (modCount > 0) updates.hasEnabledModeration = true;
        }

        // Apply updates if any
        if (Object.keys(updates).length > 0) {
            status = await this.prisma.onboarding.update({
                where: { tenantId },
                data: updates,
                include: { tenant: true }
            });
        }

        const steps = [
            { key: 'linked_bot', completed: status.hasLinkedBot, label: 'Initialize Sentinel Presence' },
            { key: 'created_command', completed: status.hasCreatedCommand, label: 'Authorize Custom Command' },
            { key: 'enabled_moderation', completed: status.hasEnabledModeration, label: 'Activate Neural Filters' },
            { key: 'imported_commands', completed: status.hasImportedCommands, label: 'Legacy Protocol Migration' },
        ];

        const completedCount = steps.filter(s => s.completed).length;
        const progress = Math.round((completedCount / steps.length) * 100);

        return {
            steps,
            progress,
            completed: progress === 100
        };
    }

    async completeStep(tenantId: string, step: string) {
        const updateData: any = {};
        switch (step) {
            case 'linked_bot': updateData.hasLinkedBot = true; break;
            case 'created_command': updateData.hasCreatedCommand = true; break;
            case 'enabled_moderation': updateData.hasEnabledModeration = true; break;
            case 'visited_dashboard': updateData.hasVisitedDashboard = true; break;
            case 'imported_commands': updateData.hasImportedCommands = true; break;
        }

        if (Object.keys(updateData).length > 0) {
            await this.prisma.onboarding.update({
                where: { tenantId },
                data: updateData
            });
        }
    }
}

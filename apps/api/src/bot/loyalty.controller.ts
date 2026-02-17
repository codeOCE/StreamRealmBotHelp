import { Controller, Get, Post, Body, Param, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { AchievementsService } from './achievements.service';
import { XpService } from './xp.service';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Assuming this exists

@Controller('loyalty')
export class LoyaltyController {
    constructor(
        private skillsService: SkillsService,
        private achievementsService: AchievementsService,
        private xpService: XpService,
    ) { }

    @Get('dashboard/:twitchUserId')
    async getDashboardData(@Param('twitchUserId') twitchUserId: string) {
        // 1. Find Tenant (assuming the user is the owner for this dashboard view)
        // OR find the tenant they are watching. For the "Streamer Dashboard", they are the tenant.
        // Let's assume this is the Streamer looking at their own bot's loyalty system settings
        // BUT the skill tree is for Viewers.
        // For testing/demo, we will return the "Streamer as a Viewer" profile.

        // Find tenant by owner's twitch ID (which is the same as the user ID for the streamer)
        const tenant = await this.xpService['prisma'].tenant.findUnique({ // accessing prisma via service or inject it here
            where: { twitchId: twitchUserId }
        });

        if (!tenant) {
            // Check if they are just a viewer of *some* tenant?
            // For now, assume Streamer Dashboard context
            throw new BadRequestException('Tenant not found for this user');
        }

        const skillTree = await this.skillsService.getSkillTree(tenant.id);

        // Get their own viewer profile (Streamer participating in their own system)
        let profile = await this.xpService['prisma'].viewerProfile.findUnique({
            where: { tenantId_twitchUserId: { tenantId: tenant.id, twitchUserId } },
            include: { unlockedSkills: true }
        });

        // If no profile, create one (Streamer first time load)
        if (!profile) {
            profile = await this.xpService['prisma'].viewerProfile.create({
                data: {
                    tenantId: tenant.id,
                    twitchUserId,
                    username: tenant.name || 'Streamer',
                    points: 100, // Give some starter points
                    skillPoints: 5, // Starter skill points
                },
                include: { unlockedSkills: true }
            });
        }

        return {
            tenantId: tenant.id,
            profile,
            skillTree
        };
    }

    @Get('skills/:tenantId')
    async getSkillTree(@Param('tenantId') tenantId: string) {
        return this.skillsService.getSkillTree(tenantId);
    }


    @Post('skills/unlock')
    async unlockSkill(@Body() body: { tenantId: string, twitchUserId: string, skillNodeId: string }) {
        // In a real app, userId should come from the JWT token
        return this.skillsService.unlockSkill(body.tenantId, body.twitchUserId, body.skillNodeId);
    }

    @Post('xp/test-add')
    async testAddXp(@Body() body: { tenantId: string, twitchUserId: string, amount: number }) {
        return this.xpService.addXp(body.tenantId, body.twitchUserId, body.amount);
    }
}

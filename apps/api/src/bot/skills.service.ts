import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class SkillsService {
    private readonly logger = new Logger(SkillsService.name);

    constructor(private prisma: PrismaService) { }

    async getSkillTree(tenantId: string) {
        return this.prisma.skillNode.findMany({
            where: { tenantId },
            include: { children: true }
        });
    }

    async getUserSkills(userId: string) {
        // userId here is the Twitch User ID, we need ViewerProfile ID
        // Note: This assumes caller handles profile lookup, or we do it here.
        // Let's assume we pass viewerProfileId for internal methods
        return [];
    }

    async unlockSkill(tenantId: string, twitchUserId: string, skillNodeId: string) {
        // 1. Get Viewer Profile
        const profile = await this.prisma.viewerProfile.findUnique({
            where: { tenantId_twitchUserId: { tenantId, twitchUserId } },
            include: { unlockedSkills: true }
        });

        if (!profile) throw new BadRequestException('Viewer profile not found');

        // 2. Get Skill Node (scoped to tenant to prevent cross-tenant access)
        const skill = await this.prisma.skillNode.findFirst({
            where: {
                id: skillNodeId,
                tenantId: tenantId
            }
        });

        if (!skill) throw new BadRequestException('Skill node not found or does not belong to this tenant');

        // 3. Validation: Already unlocked?
        const isUnlocked = profile.unlockedSkills.some(us => us.skillNodeId === skillNodeId);
        if (isUnlocked) throw new BadRequestException('Skill already unlocked');

        // 4. Validation: Can afford?
        if (profile.skillPoints < skill.cost) {
            throw new BadRequestException(`Insufficient skill points. Need ${skill.cost}, have ${profile.skillPoints}`);
        }

        // 5. Validation: Parent unlocked?
        if (skill.parentId) {
            const parentUnlocked = profile.unlockedSkills.some(us => us.skillNodeId === skill.parentId);
            if (!parentUnlocked) {
                throw new BadRequestException('Parent skill must be unlocked first');
            }
        }

        // 6. Execute Unlock
        await this.prisma.$transaction([
            this.prisma.userSkill.create({
                data: {
                    viewerProfileId: profile.id,
                    skillNodeId: skill.id
                }
            }),
            this.prisma.viewerProfile.update({
                where: { id: profile.id },
                data: {
                    skillPoints: { decrement: skill.cost }
                }
            })
        ]);

        this.logger.log(`User ${profile.username} unlocked skill: ${skill.name}`);
        return { success: true, skillName: skill.name, remainingPoints: profile.skillPoints - skill.cost };
    }
}

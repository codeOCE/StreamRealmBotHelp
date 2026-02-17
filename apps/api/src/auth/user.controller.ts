import { Controller, Get, Req } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Controller('user')
export class UserController {
    constructor(private prisma: PrismaService) { }

    @Get('me')
    async getCurrentUser(@Req() req: any) {
        // For now, return the first user (we'll implement proper session later)
        const user = await this.prisma.user.findFirst({
            select: {
                id: true,
                twitchId: true,
                username: true,
                email: true,
            },
        });

        if (!user) {
            return {
                username: 'Guest',
                avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=guest',
                tenantId: null,
            };
        }

        // Get the tenant for this user
        const tenant = await this.prisma.tenant.findFirst({
            where: { ownerId: user.id },
            select: { id: true, name: true, isConnected: true },
        });

        return {
            ...user,
            avatar: `https://static-cdn.jtvnw.net/jtv_user_pictures/${user.twitchId}-profile_image-70x70.png`,
            tenantId: tenant?.id || null,
            tenantName: tenant?.name || null,
            isConnected: tenant?.isConnected || false,
        };
    }
}

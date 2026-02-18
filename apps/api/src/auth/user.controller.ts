import { Controller, Get, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthenticatedGuard } from './authenticated.guard';

@Controller('user')
export class UserController {
    constructor(private prisma: PrismaService) { }

    @Get('me')
    @UseGuards(AuthenticatedGuard)
    async getCurrentUser(@Req() req: any) {
        // Get authenticated user from request (set by TwitchAuthGuard)
        if (!req.user?.id) {
            throw new UnauthorizedException('User not authenticated');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                twitchId: true,
                username: true,
                // email excluded for security
            },
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
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

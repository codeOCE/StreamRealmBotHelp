import { Controller, Get, UseGuards, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TwitchAuthGuard } from './twitch-auth.guard';

@Controller('auth')
export class AuthController {
    @Get('twitch')
    @UseGuards(TwitchAuthGuard)
    async twitchAuth(@Req() req: Request) {
        // Guard redirects to Twitch
    }

    @Get('twitch/callback')
    @UseGuards(TwitchAuthGuard)
    async twitchAuthCallback(@Req() req: Request, @Res() res: Response) {
        res.redirect('http://localhost:3002/dashboard?connected=true');
    }

    @Get('bot')
    @UseGuards(TwitchAuthGuard)
    async botAuth(@Req() req: Request) {
        // State is passed via query: /auth/bot?state=bot:USER_ID
    }

    @Get('bot/callback')
    @UseGuards(TwitchAuthGuard)
    async botAuthCallback(@Req() req: Request, @Res() res: Response) {
        res.redirect('http://localhost:3002/dashboard/settings?botConnected=true');
    }
}

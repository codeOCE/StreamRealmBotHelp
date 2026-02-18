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
        // Log user state before login
        console.log(`[AuthController] Callback - User before login: ${req.user ? (req.user as any).username : 'NOT SET'}, SessionID: ${req.sessionID}`);
        
        if (!req.user) {
            console.error('[AuthController] No user found after authentication!');
            return res.redirect('http://localhost:3002?error=no_user');
        }

        // Store user in a variable to satisfy TypeScript
        const user = req.user;

        // Explicitly log in the user to trigger session serialization
        // This is crucial - Passport needs req.login() to serialize the user into the session
        return new Promise<void>((resolve, reject) => {
            req.login(user, (err) => {
                if (err) {
                    console.error('[AuthController] Login error:', err);
                    return res.redirect('http://localhost:3002?error=login_failed');
                }
                
                console.log(`[AuthController] User logged in: ${(user as any).username}`);
                console.log(`[AuthController] Session data after login:`, JSON.stringify(req.session, null, 2));
                
                // Save session before redirecting to ensure set-cookie header is sent
                req.session.save((saveErr) => {
                    if (saveErr) {
                        console.error('[AuthController] Session save error:', saveErr);
                        return res.redirect('http://localhost:3002?error=session_save_failed');
                    }
                    console.log(`[AuthController] Session saved successfully. Redirecting to dashboard.`);
                    res.redirect('http://localhost:3002/dashboard?connected=true');
                    resolve();
                });
            });
        });
    }

    @Get('bot')
    @UseGuards(TwitchAuthGuard)
    async botAuth(@Req() req: Request) {
        // State is passed via query: /auth/bot?state=bot:USER_ID
    }

    @Get('bot/callback')
    @UseGuards(TwitchAuthGuard)
    async botAuthCallback(@Req() req: Request, @Res() res: Response) {
        if (!req.user) {
            console.error('[AuthController] No user found after bot authentication!');
            return res.redirect('http://localhost:3002/dashboard/settings?error=no_user');
        }

        // Store user in a variable to satisfy TypeScript
        const user = req.user;

        // Log in the user to trigger session serialization
        return new Promise<void>((resolve, reject) => {
            req.login(user, (err) => {
                if (err) {
                    console.error('[AuthController] Bot login error:', err);
                    return res.redirect('http://localhost:3002/dashboard/settings?error=login_failed');
                }
                
                req.session.save((saveErr) => {
                    if (saveErr) {
                        console.error('[AuthController] Bot session save error:', saveErr);
                    }
                    res.redirect('http://localhost:3002/dashboard/settings?botConnected=true');
                    resolve();
                });
            });
        });
    }
}

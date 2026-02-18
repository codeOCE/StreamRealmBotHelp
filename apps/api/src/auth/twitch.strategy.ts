import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-twitch-new';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Injectable()
export class TwitchStrategy extends PassportStrategy(Strategy, 'twitch') {
    constructor(
        private authService: AuthService,
        private configService: ConfigService,
    ) {
        super({
            clientID: configService.get<string>('TWITCH_CLIENT_ID'),
            clientSecret: configService.get<string>('TWITCH_CLIENT_SECRET'),
            callbackURL: configService.get<string>('TWITCH_REDIRECT_URI'),
            scope: [
                'user:read:email',
                'chat:read',
                'chat:edit',
                'channel:read:subscriptions',
                'channel:manage:broadcast',
                'channel:read:redemptions',
                'moderator:manage:banned_users',
                'user:write:chat',
                'user:bot',
                'channel:bot',
            ],
            passReqToCallback: true,
        });
    }

    async validate(req: any, accessToken: string, refreshToken: string, profile: any) {
        console.log(`[TwitchStrategy] Validating user: ${profile.login} (${profile.id}). AccessToken length: ${accessToken?.length}`);
        const state = req.query.state;

        try {
            // If state contains owner ID, it's a bot login
            if (state && state.startsWith('bot:')) {
                console.log(`[TwitchStrategy] Detected BOT login for owner: ${state.split(':')[1]}`);
                const ownerTwitchId = state.split(':')[1];
                return await this.authService.validateBot(ownerTwitchId, profile, accessToken, refreshToken);
            }

            console.log(`[TwitchStrategy] Detected USER login`);
            return await this.authService.validateUser(profile, accessToken, refreshToken);
        } catch (error) {
            console.error('[TwitchStrategy] Validation Error:', error);
            throw error;
        }
    }
}

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
        const state = req.query.state;

        // If state contains owner ID, it's a bot login
        if (state && state.startsWith('bot:')) {
            const ownerTwitchId = state.split(':')[1];
            return this.authService.validateBot(ownerTwitchId, profile, accessToken, refreshToken);
        }

        return this.authService.validateUser(profile, accessToken, refreshToken);
    }
}

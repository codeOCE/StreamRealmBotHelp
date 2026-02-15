import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class TwitchAuthGuard extends AuthGuard('twitch') {
    getAuthenticateOptions(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();
        const state = request.query.state;

        if (state) {
            return { state };
        }

        return {};
    }
}

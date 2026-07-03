import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { isDevSkipAuth, DEV_USER } from './dev-auth';

@Injectable()
export class AuthenticatedGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();

        if (isDevSkipAuth()) {
            if (!request.user) request.user = { ...DEV_USER };
            return true;
        }

        if (request.isAuthenticated()) {
            return true;
        }
        throw new UnauthorizedException();
    }
}

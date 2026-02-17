import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class SessionSerializer extends PassportSerializer {
    constructor(
        private readonly authService: AuthService,
        private readonly prisma: PrismaService,
    ) {
        super();
    }

    serializeUser(user: any, done: Function) {
        done(null, user.id);
    }

    async deserializeUser(payload: any, done: Function) {
        try {
            const user = await this.prisma.user.findUnique({ where: { id: payload } });
            done(null, user);
        } catch (err) {
            done(err);
        }
    }
}

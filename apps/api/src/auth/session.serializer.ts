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
        console.log(`[SessionSerializer] Serializing user: ${user?.username} (ID: ${user?.id})`);
        if (!user || !user.id) {
            console.error(`[SessionSerializer] Invalid user object for serialization:`, user);
            return done(new Error('Invalid user object'));
        }
        done(null, user.id);
    }

    async deserializeUser(payload: any, done: Function) {
        try {
            console.log(`[SessionSerializer] Deserializing user with payload: ${payload}`);
            if (!payload) {
                console.warn(`[SessionSerializer] No payload provided for deserialization`);
                return done(null, false);
            }
            const user = await this.prisma.user.findUnique({ where: { id: payload } });
            if (!user) {
                console.warn(`[SessionSerializer] User not found for payload: ${payload}`);
                return done(null, false);
            }
            console.log(`[SessionSerializer] Successfully deserialized user: ${user.username} (ID: ${user.id})`);
            done(null, user);
        } catch (err) {
            console.error(`[SessionSerializer] Error deserializing user ${payload}:`, err);
            done(err);
        }
    }
}

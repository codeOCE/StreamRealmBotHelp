import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserController } from './user.controller';
import { TwitchStrategy } from './twitch.strategy';
import { SessionSerializer } from './session.serializer';
import { PrismaModule } from '../common/prisma/prisma.module';
import { SecurityModule } from '../common/security/security.module';
import { BotModule } from '../bot/bot.module';

@Module({
    imports: [
        PassportModule.register({ defaultStrategy: 'twitch', session: true }),
        PrismaModule,
        SecurityModule,
        BotModule,
    ],
    providers: [AuthService, TwitchStrategy, SessionSerializer],
    controllers: [AuthController, UserController],
    exports: [AuthService],
})
export class AuthModule { }

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TwitchStrategy } from './twitch.strategy';
import { PrismaModule } from '../common/prisma/prisma.module';
import { SecurityModule } from '../common/security/security.module';
import { BotModule } from '../bot/bot.module';

@Module({
    imports: [
        PassportModule.register({ defaultStrategy: 'twitch' }),
        PrismaModule,
        SecurityModule,
        BotModule,
    ],
    providers: [AuthService, TwitchStrategy],
    controllers: [AuthController],
    exports: [AuthService],
})
export class AuthModule { }

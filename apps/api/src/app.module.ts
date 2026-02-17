import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { TenantsModule } from './tenants/tenants.module';
import { BotModule } from './bot/bot.module';
import { SecurityModule } from './common/security/security.module';
import { AuthModule } from './auth/auth.module';
import { OverlayModule } from './overlay/overlay.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: 'localhost',
        port: 6379,
      },
    }),
    PrismaModule,
    UsersModule,
    TenantsModule,
    BotModule,
    SecurityModule,
    AuthModule,
    OverlayModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }

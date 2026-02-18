import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.validateEnvironmentVariables();
  }

  private validateEnvironmentVariables() {
    const requiredVars = [
      'TWITCH_CLIENT_ID',
      'TWITCH_CLIENT_SECRET',
      'TWITCH_REDIRECT_URI',
    ];

    const missing: string[] = [];
    const present: string[] = [];

    for (const varName of requiredVars) {
      const value = this.configService.get<string>(varName);
      if (!value || value.trim() === '') {
        missing.push(varName);
      } else {
        present.push(varName);
        // Log partial values for debugging (first 4 chars + length)
        if (varName.includes('SECRET') || varName.includes('TOKEN')) {
          this.logger.log(`${varName}: ${value.substring(0, 4)}... (${value.length} chars)`);
        } else {
          this.logger.log(`${varName}: ${value}`);
        }
      }
    }

    if (missing.length > 0) {
      this.logger.error('❌ Missing required Twitch environment variables:');
      missing.forEach(varName => {
        this.logger.error(`   - ${varName}`);
      });
      this.logger.error('');
      this.logger.error('Please set these in your .env file (usually in apps/api/.env)');
      this.logger.error('You can get these values from: https://dev.twitch.tv/console/apps');
      this.logger.error('');
      this.logger.warn('⚠️  The application may not work correctly without these variables.');
    } else {
      this.logger.log('✅ All required Twitch environment variables are present');
      
      // Validate redirect URI format
      const redirectUri = this.configService.get<string>('TWITCH_REDIRECT_URI');
      if (redirectUri) {
        if (redirectUri.includes('localhost') || redirectUri.includes('127.0.0.1')) {
          this.logger.log(`📍 Redirect URI: ${redirectUri} (localhost detected - make sure this matches your Twitch app settings)`);
        } else {
          this.logger.log(`📍 Redirect URI: ${redirectUri}`);
        }
        this.logger.log('💡 Make sure this redirect URI is added to your Twitch app\'s OAuth Redirect URLs');
      }
    }
  }
}

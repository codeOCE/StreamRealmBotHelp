import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BotManagerService } from './bot-manager.service';
import { ChatHandlerService } from './chat-handler.service';
import { RateLimiterService, MessageProcessor } from './rate-limiter.service';
import { ModerationService } from './moderation.service';
import { XpService } from './xp.service';
import { SkillsService } from './skills.service';
import { AchievementsService } from './achievements.service';
import { CommandsService } from './commands.service';
import { CommandsController } from './commands.controller';
import { ModerationController } from './moderation.controller';
import { TimerController } from './timer.controller';
import { LoyaltyController } from './loyalty.controller';
import { VariableService } from './variable.service';
import { ExternalBotService } from './external-bot.service';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { LoyaltyService } from './loyalty.service';
import { TimerService } from './timer.service';
import { TwitchApiService } from './twitch-api.service';
import { BotEventsGateway } from './bot-events.gateway';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { TestCommandService } from './test-command.service';
import { TestCommandController } from './test-command.controller';
import { OnboardingService } from '../dashboard/onboarding.service';
import { OnboardingController } from '../dashboard/onboarding.controller';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
import { BattleService } from './battle.service';
import { BattleController } from './battle.controller';
import { VariableParserService } from './variable-parser.service';
import { NightbotAuthController } from './nightbot-auth.controller';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'outgoing-messages',
        }),
        PrismaModule,
    ],
    controllers: [CommandsController, ModerationController, TimerController, LoyaltyController, AuditController, AnalyticsController, IntegrationsController, TestCommandController, OnboardingController, ImportController, BattleController, NightbotAuthController],
    providers: [
        BotManagerService,
        ChatHandlerService,
        RateLimiterService,
        MessageProcessor,
        ModerationService,
        XpService,
        SkillsService,
        AchievementsService,
        LoyaltyService,
        TimerService,
        CommandsService,
        VariableService,
        TwitchApiService,
        BotEventsGateway,
        AuditService,
        AnalyticsService,
        ExternalBotService,
        IntegrationsService,
        TestCommandService,
        OnboardingService,
        ImportService,
        BattleService,
        VariableParserService,
    ],
    exports: [BotManagerService, RateLimiterService, BotEventsGateway, XpService, SkillsService, AchievementsService],
})
export class BotModule { }

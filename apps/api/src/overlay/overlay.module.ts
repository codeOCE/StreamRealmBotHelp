import { Module } from '@nestjs/common';
import { OverlayController } from './overlay.controller';
import { OverlayService } from './overlay.service';
import { OverlayWidgetService } from './overlay-widget.service';
import { OverlayEventsGateway } from './overlay-events.gateway';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [OverlayController],
    providers: [OverlayService, OverlayWidgetService, OverlayEventsGateway],
    exports: [OverlayService, OverlayWidgetService, OverlayEventsGateway],
})
export class OverlayModule { }

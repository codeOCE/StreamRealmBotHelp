import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { AuthenticatedGuard } from '../auth/authenticated.guard';

@Controller('dashboard/onboarding')
@UseGuards(AuthenticatedGuard)
export class OnboardingController {
    constructor(private onboardingService: OnboardingService) { }

    @Get(':tenantId')
    async getStatus(@Param('tenantId') tenantId: string) {
        return this.onboardingService.getStatus(tenantId);
    }

    @Post(':tenantId/:step')
    async completeStep(
        @Param('tenantId') tenantId: string,
        @Param('step') step: string
    ) {
        return this.onboardingService.completeStep(tenantId, step);
    }
}

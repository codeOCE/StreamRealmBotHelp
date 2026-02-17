import { Controller, Get, Post, Param } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

@Controller('dashboard/onboarding')
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

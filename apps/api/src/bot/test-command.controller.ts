import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TestCommandService, SimulationResult } from './test-command.service';

interface TestCommandDto {
    tenantId: string;
    trigger: string;
    message: string;
    userContext: {
        username?: string;
        userId?: string;
        channel?: string;
        broadcasterId?: string;
    };
}

@Controller('commands')
export class TestCommandController {
    constructor(private testCommandService: TestCommandService) { }

    @Post('test')
    async testCommand(@Body() body: TestCommandDto) {
        return this.testCommandService.simulate(
            body.tenantId,
            body.trigger,
            body.message,
            body.userContext || {}
        );
    }
}

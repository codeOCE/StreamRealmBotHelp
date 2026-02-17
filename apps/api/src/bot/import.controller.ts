import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ImportService } from './import.service';

@Controller('commands/import')
export class ImportController {
    constructor(private readonly importService: ImportService) { }

    @Post('streamelements')
    @HttpCode(HttpStatus.OK)
    async fetchStreamElements(@Body() body: { tenantId: string; token: string }) {
        const commands = await this.importService.fetchStreamElementsCommands(body.token);
        return { commands };
    }

    @Post('process')
    @HttpCode(HttpStatus.OK)
    async processImport(@Body() body: { tenantId: string; provider: string; commands: any[] }) {
        return this.importService.processImport(body.tenantId, body.provider, body.commands);
    }
}

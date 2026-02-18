import { Controller, Get, Param, Req, UnauthorizedException } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { SessionGuard } from '../auth/session.guard';

@Controller('user')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('me')
    @UseGuards(SessionGuard)
    getMe(@Req() req: any) {
        return req.user;
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.usersService.user({ id });
    }
}
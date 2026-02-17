import { Controller, Get, Param } from '@nestjs/common';
import { BattleService } from './battle.service';

@Controller('battles')
export class BattleController {
    constructor(private battleService: BattleService) { }

    @Get('history/:tenantId')
    async getBattleHistory(@Param('tenantId') tenantId: string) {
        return this.battleService.getBattleHistory(tenantId, 20);
    }

    @Get('leaderboard/:tenantId')
    async getLeaderboard(@Param('tenantId') tenantId: string) {
        const leaderboard = await this.battleService.getLeaderboard(tenantId, 10);
        return leaderboard.map((player, index) => ({
            rank: index + 1,
            username: player.username,
            mmr: player.mmr,
            totalBattles: player.battlesAsChallenger.length + player.battlesAsOpponent.length,
            wins: player.battlesWon.length
        }));
    }

    @Get('stats/:tenantId/:username')
    async getPlayerStats(
        @Param('tenantId') tenantId: string,
        @Param('username') username: string
    ) {
        return this.battleService.getPlayerStats(tenantId, username);
    }
}

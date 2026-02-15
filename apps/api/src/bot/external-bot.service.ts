import { Injectable, Logger } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';

@Injectable()
export class ExternalBotService {
    private readonly logger = new Logger(ExternalBotService.name);

    constructor(private integrationsService: IntegrationsService) { }

    async fetchNightbotCommands(token: string) {
        try {
            const res = await fetch('https://api.nightbot.tv/1/commands', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            if (!data.commands) return [];

            return data.commands.map((cmd: any) => ({
                trigger: cmd.name.replace('!', ''),
                responses: [cmd.message],
                userLevel: this.mapNightbotLevel(cmd.userLevel),
                cooldown: cmd.coolDown || 10,
                source: 'Nightbot'
            }));
        } catch (err) {
            this.logger.error('Failed to fetch from Nightbot', err);
            throw err;
        }
    }

    async fetchSECommands(channelId: string, token: string) {
        try {
            const res = await fetch(`https://api.streamelements.com/kappa/v2/commands/${channelId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            if (!Array.isArray(data)) return [];

            return data.map((cmd: any) => ({
                trigger: cmd.command,
                responses: [cmd.reply],
                userLevel: this.mapSELevel(cmd.enabledPermission),
                cooldown: cmd.cooldown?.global || 10,
                source: 'StreamElements'
            }));
        } catch (err) {
            this.logger.error('Failed to fetch from StreamElements', err);
            throw err;
        }
    }

    private mapNightbotLevel(level: string): string {
        const map: Record<string, string> = {
            'everyone': 'VIEWER',
            'subscriber': 'SUBSCRIBER',
            'moderator': 'MODERATOR',
            'owner': 'BROADCASTER'
        };
        return map[level.toLowerCase()] || 'VIEWER';
    }

    private mapSELevel(level: number): string {
        // SE levels: 0=everyone, 100=sub, 500=mod, 1000=broadcaster
        if (level >= 1000) return 'BROADCASTER';
        if (level >= 500) return 'MODERATOR';
        if (level >= 100) return 'SUBSCRIBER';
        return 'VIEWER';
    }

    async syncIntegrated(tenantId: string, provider: 'nightbot' | 'se', seChannelId?: string) {
        const token = await this.integrationsService.getAccessToken(tenantId, provider);
        if (!token) throw new Error(`No active integration found for ${provider}`);

        if (provider === 'nightbot') {
            return this.fetchNightbotCommands(token);
        } else if (provider === 'se') {
            if (!seChannelId) throw new Error('SE Channel ID is required');
            return this.fetchSECommands(seChannelId, token);
        }
        return [];
    }
}

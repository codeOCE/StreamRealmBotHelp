import { Injectable, Logger } from '@nestjs/common';
import { TwitchApiService } from './twitch-api.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { SecurityService } from '../common/security/security.service';
import { evaluate } from 'mathjs';

export interface ParseContext {
    user: string;
    userId: string;
    channel: string;
    broadcasterId: string;
    count: number;
    args: string[];
    msgId?: string;
}

@Injectable()
export class VariableService {
    private readonly logger = new Logger(VariableService.name);

    constructor(
        private twitchApi: TwitchApiService,
        private prisma: PrismaService,
        private security: SecurityService
    ) { }

    /**
     * Automatically converts external syntax (like StreamElements) to our native high-performance format.
     */
    normalizeSyntax(input: string): string {
        if (!input) return '';
        let result = input;

        // 1. Convert ${...} to $(...) recursively from innermost to outermost
        let iteration = 0;
        while (result.includes('${') && iteration < 10) {
            iteration++;
            const next = result.replace(/\$\{([^{}]+)\}/g, (match, inner) => `$(${inner})`);
            if (next === result) break;
            result = next;
        }

        // 2. Map Common SE Aliases/Variables
        const aliasMap: Record<string, string> = {
            'channel.name': 'channel',
            'user.name': 'user',
            'sender.name': 'sender',
            'touser.name': 'touser',
        };

        // Replace aliases and handle basic normalization within $() containers
        result = result.replace(/\$\(([^()]+)\)/g, (match, inner) => {
            let normalizedInner = inner.trim();
            for (const [alias, native] of Object.entries(aliasMap)) {
                if (normalizedInner === alias) {
                    normalizedInner = native;
                    break;
                }
            }
            return `$(${normalizedInner})`;
        });

        return result;
    }

    /**
     * Parses a string and replaces variables recursively to support nested tags.
     */
    async parse(input: string, context: ParseContext): Promise<string> {
        let result = this.normalizeSyntax(input);
        let iteration = 0;
        const MAX_ITERATIONS = 5; // Prevent Infinite Recursion

        while (result.includes('$(') && iteration < MAX_ITERATIONS) {
            iteration++;
            // Find the innermost $(...) tag
            const match = result.match(/\$\(([^()]+)\)/);
            if (!match) break;

            const fullTag = match[0];
            const content = match[1].trim();
            const value = await this.resolveVariable(content, context);

            // Replace only the FIRST occurrence of this specific innermost tag
            result = result.replace(fullTag, value);
        }

        // Final cleanup for legacy curly braces {user}
        result = result.replace(/{user}/gi, context.user);
        result = result.replace(/{count}/gi, context.count.toString());
        result = result.replace(/{touser}/gi, context.args.length > 0 ? context.args[0].replace('@', '') : context.user);
        result = result.replace(/{channel}/gi, context.channel.replace('#', ''));

        return result;
    }

    private async resolveVariable(content: string, context: ParseContext): Promise<string> {
        // Handle $() tags based on content
        const [cmd, ...args] = content.split(' ');
        const fullArgs = args.join(' ');
        const cmdLower = cmd.toLowerCase();

        switch (cmdLower) {
            case 'eval':
                try {
                    return this.evalJS(fullArgs, context);
                } catch (err) {
                    return `[Eval Error: ${err.message}]`;
                }
            case 'user':
            case 'sender':
            case 'source':
                return context.user;
            case 'userid':
            case 'user.id':
                return context.userId;
            case 'channel':
                return context.channel.replace('#', '');
            case 'count':
                if (args.length > 0) {
                    const trigger = args[0].replace('!', '');
                    const tenantId = await this.getTenantId(context.broadcasterId);
                    const cmdData = await this.prisma.command.findFirst({
                        where: { tenantId, trigger }
                    });
                    return (cmdData?.usages || 0).toString();
                }
                return context.count.toString();
            case 'query':
                return context.args.join(' ');
            case 'touser':
                return context.args.length > 0 ? context.args[0].replace('@', '') : context.user;
            case 'touserid':
                if (context.args.length > 0) {
                    const info = await this.twitchApi.getUserInfo(context.args[0].replace('@', ''));
                    return info?.id || 'unknown';
                }
                return context.userId;
            case 'random.pick':
                const options = fullArgs.match(/"(.+?)"/g)?.map((o: string) => o.replace(/"/g, '')) ||
                    fullArgs.split(',').map(s => s.trim()).filter(s => s);
                return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : 'No options';
            case 'uptime':
            case 'uptimelength':
            case 'game':
            case 'title': {
                // Support target user argument: $(game @user)
                if (args.length > 0 && args[0].startsWith('@')) {
                    const targetUser = args[0].replace('@', '');
                    const info = await this.twitchApi.getUserInfo(targetUser);
                    if (info?.id) {
                        const channelInfo = await this.twitchApi.getChannelInfo(info.id);
                        if (cmdLower === 'game') return channelInfo?.game_name || 'Unknown';
                        return channelInfo?.title || 'Unknown';
                    }
                }

                // Default GET for current channel
                const info = await this.twitchApi.getChannelInfo(context.broadcasterId);
                return (cmdLower === 'game' ? info?.game_name : info?.title) || 'Unknown';
            }
            case 'followage':
                const followTarget = args.length > 0 ? args[0].replace('@', '') : context.user;
                // Need ID for follow target
                let followTargetId = context.userId;
                if (followTarget !== context.user) {
                    const u = await this.twitchApi.getUserInfo(followTarget);
                    if (u) followTargetId = u.id;
                    else return 'unknown user';
                }
                const follow = await this.twitchApi.getUserFollow(context.broadcasterId, followTargetId);
                if (!follow) return 'not following';
                const fDays = Math.floor((Date.now() - new Date(follow.followed_at).getTime()) / 86400000);
                return `${fDays} days`;
            case 'watchtime':
            case 'user.time_online': {
                const targetU = args.length > 0 ? args[0].replace('@', '') : context.user;
                const tenantId = await this.getTenantId(context.broadcasterId);
                // We need to resolve ID from username if target is specified
                // For now, assuming we can find profile by username or via Twitch API lookup?
                // ViewerProfile has twitchUserId.
                let tUserId = context.userId;
                if (targetU !== context.user) {
                    const u = await this.twitchApi.getUserInfo(targetU);
                    if (u) tUserId = u.id;
                    else return '0m';
                }
                const profile = await this.prisma.viewerProfile.findFirst({ where: { tenantId, twitchUserId: tUserId } });
                const mins = (profile as any)?.watchTime || 0;
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                return `${h}h ${m}m`;
            }
            case 'getcount':
                if (args.length === 0) return '0';
                const trigger = args[0].replace('!', '');
                const tId = await this.getTenantId(context.broadcasterId);
                const cmdData = await this.prisma.command.findFirst({ where: { tenantId: tId, trigger } });
                return (cmdData?.usages || 0).toString();
            case 'weather':
                if (!fullArgs) return '[Location Missing]';
                try {
                    const res = await fetch(`https://wttr.in/${encodeURIComponent(fullArgs)}?format=3`);
                    if (!res.ok) return '[Weather Error]';
                    return (await res.text()).trim();
                } catch { return '[Weather Service Unavailable]'; }
            case 'random.range':
            case 'random.number':
            case 'random':
                const numRange = fullArgs.includes('-') ? fullArgs.split('-') : fullArgs.split(' ');
                // If args are provided separate by space or dash
                let min = 0, max = 100;
                if (numRange.length >= 2) {
                    min = parseInt(numRange[0]);
                    max = parseInt(numRange[1]);
                } else if (numRange.length === 1 && numRange[0]) {
                    max = parseInt(numRange[0]);
                }

                if (!isNaN(min) && !isNaN(max)) {
                    return Math.floor(Math.random() * (max - min + 1) + min).toString();
                }
                return Math.floor(Math.random() * 100).toString();
            case 'time':
                try {
                    const options: Intl.DateTimeFormatOptions = {
                        hour: 'numeric', minute: 'numeric', second: 'numeric',
                        hour12: true, timeZoneName: 'short'
                    };
                    if (fullArgs) options.timeZone = fullArgs.trim();
                    return new Intl.DateTimeFormat('en-US', options).format(new Date());
                } catch { return new Date().toLocaleTimeString(); }
            case 'accountage':
                const uInfo = await this.twitchApi.getUserInfoById(context.userId);
                if (uInfo?.created_at) {
                    const created = new Date(uInfo.created_at).getTime();
                    const diff = Date.now() - created;
                    const years = Math.floor(diff / (31536000000));
                    const days = Math.floor(diff / (86400000)) % 365;
                    return `${years}y ${days}d`;
                }
                return 'unknown';
            case 'customapi':
            case 'urlfetch':
                if (!fullArgs) return '[URL Missing]';
                try {
                    const res = await fetch(fullArgs);
                    return (await res.text()).substring(0, 400);
                } catch { return '[Fetch Error]'; }
            case 'if':
                // SE standard uses ; while we use , - handle both recursively
                const delimiter = fullArgs.includes(';') ? ';' : ',';
                const parts = fullArgs.split(delimiter).map(p => p.trim());

                if (parts.length < 2) return '[Invalid If Structure]';

                const condition = parts[0];
                const trueBranch = parts[1];
                const falseBranch = parts[2] || '';

                // Truthy logic: non-empty, not "0", not "false", not "undefined", not "null"
                const isTruthy = condition &&
                    condition !== '0' &&
                    condition.toLowerCase() !== 'false' &&
                    condition.toLowerCase() !== 'undefined' &&
                    condition.toLowerCase() !== 'null';

                return isTruthy ? trueBranch : falseBranch;
            case 'msgid':
                return context.msgId || 'unknown';
            case 'botname':
                return 'StreamRealmBot';
            case 'channel.viewers':
                const viewers = await this.twitchApi.getViewerCount(context.channel);
                return viewers.toLocaleString();
            case 'channel.followers':
            case 'followercount':
                const followers = await this.twitchApi.getFollowerCount(context.broadcasterId);
                return followers.toLocaleString();
            case 'channel.subs':
            case 'subcount':
            case 'subscriber_count':
                const count = await this.executeWithUserTokenRefresh(
                    context.broadcasterId,
                    async (token) => await this.twitchApi.getSubscriberCount(context.broadcasterId, token)
                );
                return count === -1 ? '0' : count?.toString() || '0';
            case 'shoutout':
                const target = args[0]?.replace('@', '');
                return target ? `📢 Go check out ${target} at twitch.tv/${target}! They are doing amazing things. 💜` : '[Target Missing]';
            case 'random.emote':
            case 'twitchemotes':
            case 'bttvemotes':
            case 'ffzemotes':
            case '7tvemotes':
                return 'PogChamp'; // Mock for now
            case 'channel.id':
                return context.broadcasterId;
            case 'channel.slug':
                return context.channel.replace('#', '');
            case 'latest.follower':
                return await this.twitchApi.getLatestFollower(context.broadcasterId) || 'None';
            case 'random.chatter': {
                const tId = await this.getTenantId(context.broadcasterId);
                const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                // Find active profiles in last 5 mins
                const activeViewers = await this.prisma.viewerProfile.findMany({
                    where: {
                        tenantId: tId,
                        lastActiveAt: { gt: fiveMinutesAgo }
                    },
                    select: { username: true }
                });

                if (activeViewers.length === 0) return context.user;
                const randomViewer = activeViewers[Math.floor(Math.random() * activeViewers.length)];
                return randomViewer.username;
            }
            case 'repeat':
                const repeatCount = parseInt(args[0]);
                const repeatText = args.slice(1).join(' ');
                if (!isNaN(repeatCount) && repeatText) {
                    return Array(Math.min(repeatCount, 20)).fill(repeatText).join(' ');
                }
                return '';
            case 'pointsname':
                return 'Points';
            case 'xp':
            case 'user.xp': {
                const tenantId = await this.getTenantId(context.broadcasterId);
                const stats = await this.prisma.viewerProfile.findFirst({ where: { tenantId, twitchUserId: context.userId } });
                return (stats as any)?.xp?.toLocaleString() || '0';
            }
            case 'level':
            case 'user.level': {
                const tenantId = await this.getTenantId(context.broadcasterId);
                const stats = await this.prisma.viewerProfile.findFirst({ where: { tenantId, twitchUserId: context.userId } });
                return (stats as any)?.level?.toString() || '1';
            }
            case 'rank':
            case 'user.points_rank': {
                const tenantId = await this.getTenantId(context.broadcasterId);
                const count = await this.prisma.viewerProfile.count({ where: { tenantId, xp: { gt: 0 } } });
                // Simple rank for now: total count (needs real sorting in prod)
                return count.toString();
            }
            case 'points':
            case 'user.points': {
                const tenantId = await this.getTenantId(context.broadcasterId);
                const stats = await this.prisma.viewerProfile.findFirst({ where: { tenantId, twitchUserId: context.userId } });
                return (stats as any)?.points?.toLocaleString() || '0';
            }
            case 'queryescape':
                return encodeURIComponent(fullArgs);
            case 'pathescape':
                return encodeURIComponent(fullArgs).replace(/%2F/g, '/');
            case 'math':
                try {
                    // Safe math evaluation using mathjs
                    const cleanMath = fullArgs.replace(/[^0-9+\-*/().\s]/g, '');
                    const result = evaluate(cleanMath);
                    return result.toString();
                } catch { return '[Math Error]'; }
            default:
                // Handle range arguments $(1:), $(2:) etc
                if (cmd.endsWith(':')) {
                    const startNum = parseInt(cmd.slice(0, -1));
                    if (!isNaN(startNum) && startNum > 0) {
                        const val = context.args.slice(startNum - 1).join(' ');
                        // Default to user if checking for first arg range and it's empty
                        if (!val && startNum === 1) return context.user;
                        return val;
                    }
                }

                // Handle numeric arguments $(1), $(2) etc
                const argNum = parseInt(cmd);
                if (!isNaN(argNum)) {
                    const val = context.args[argNum - 1];
                    // Default to user if checking for first arg and it's empty
                    if (!val && argNum === 1) return context.user;
                    return val || '';
                }
                return `$(unknown:${cmd})`;
        }
    }

    private evalJS(code: string, context: ParseContext): string {
        // Safe evaluation simulation for common Nightbot patterns
        // Mapping context to common Nightbot JS variables
        const sandbox = {
            user: context.user,
            touser: context.args.length > 0 ? context.args[0].replace('@', '') : context.user,
            query: context.args.join(' '),
            channel: context.channel.replace('#', ''),
            count: context.count,
            Math: Math,
            decodeURIComponent: decodeURIComponent,
            encodeURIComponent: encodeURIComponent,
        };

        try {
            // Use Function constructor for basic sandboxing (not foolproof, but standard for bot evals in this tier)
            const fn = new Function(...Object.keys(sandbox), `return (function() { ${code} })()`);
            const result = fn(...Object.values(sandbox));
            return result?.toString() || '';
        } catch (err) {
            this.logger.error(`JS Eval failed: ${code}`, err);
            throw err;
        }
    }

    private async getTenantId(twitchId: string): Promise<string> {
        const tenant = await this.prisma.tenant.findUnique({ where: { twitchId } });
        return tenant?.id || 'default';
    }

    private async getOwnerToken(broadcasterId: string): Promise<string | null> {
        const tenant = await this.prisma.tenant.findUnique({
            where: { twitchId: broadcasterId },
            include: { owner: true }
        });

        if (!tenant?.owner?.encryptedAccessToken) return null;

        try {
            return this.security.decrypt(tenant.owner.encryptedAccessToken);
        } catch (err) {
            this.logger.error(`Failed to decrypt owner token for broadcaster ${broadcasterId}`, err);
            return null;
        }
    }

    private async executeWithUserTokenRefresh<T>(
        broadcasterId: string,
        action: (token: string) => Promise<T>
    ): Promise<T | null> {
        const tenant = await this.prisma.tenant.findUnique({
            where: { twitchId: broadcasterId },
            include: { owner: true }
        });

        if (!tenant?.owner?.encryptedAccessToken) return null;

        let token: string;
        try {
            token = this.security.decrypt(tenant.owner.encryptedAccessToken);
        } catch { return null; }

        const result = await action(token);

        // Check if result indicates 401 (Action must return specific error or -1 or similar for us to know)
        // For sendChatMessage (not used here) it was explicit.
        // For updateChannelInfo, it returns { success: false, error: '...' }
        // For getSubscriberCount, it returns -1.

        // Helper to detect 401 based on result shape
        const isUnauthorized = (res: any) => {
            if (res === -1) return true;
            if (res && typeof res === 'object' && res.success === false && (res.error?.includes?.('401') || res.error?.includes?.('Unauthorized'))) return true;
            return false;
        };

        if (isUnauthorized(result) && tenant.owner.encryptedRefreshToken) {
            this.logger.warn(`Helix 401. Refreshing Owner Token for ${broadcasterId}...`);
            try {
                const refreshToken = this.security.decrypt(tenant.owner.encryptedRefreshToken);
                const refreshRes = await this.twitchApi.refreshUserToken(refreshToken);

                if (refreshRes) {
                    await this.prisma.user.update({
                        where: { id: tenant.owner.id },
                        data: {
                            encryptedAccessToken: this.security.encrypt(refreshRes.accessToken),
                            encryptedRefreshToken: this.security.encrypt(refreshRes.refreshToken),
                            tokenExpiresAt: new Date(Date.now() + refreshRes.expiresIn * 1000)
                        }
                    });
                    this.logger.log(`Owner token refreshed. Retrying action...`);
                    return await action(refreshRes.accessToken);
                }
            } catch (e) {
                this.logger.error('Token refresh failed', e);
            }
        }
        return result;
    }
}

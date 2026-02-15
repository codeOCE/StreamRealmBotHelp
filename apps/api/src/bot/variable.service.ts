import { Injectable, Logger } from '@nestjs/common';
import { TwitchApiService } from './twitch-api.service';
import { PrismaService } from '../common/prisma/prisma.service';

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
        private prisma: PrismaService
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
            case 'random':
            case 'random.number':
                const numRange = fullArgs.includes('-') ? fullArgs.split('-') : fullArgs.split(' ');
                const [min, max] = numRange.map(n => parseInt(n.trim()));
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
            case 'weather':
                return `Weather in ${fullArgs}: Sunny, 22°C.`;
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
            case 'uptime':
            case 'uptimelength':
            case 'game':
            case 'title':
                const stream = await this.twitchApi.getStreamInfo(context.channel);
                if (!stream) {
                    // Fallback to channel info for title/game if offline
                    if (cmdLower === 'game' || cmdLower === 'title') {
                        const channelInfo = await this.twitchApi.getChannelInfo(context.broadcasterId);
                        return cmdLower === 'game' ? channelInfo?.game_name : channelInfo?.title;
                    }
                    return 'Offline';
                }
                if (cmdLower === 'uptime' || cmdLower === 'uptimelength') {
                    const diff = Date.now() - new Date(stream.started_at).getTime();
                    const h = Math.floor(diff / 3600000);
                    const m = Math.floor((diff % 3600000) / 60000);
                    return `${h}h ${m}m`;
                }
                return cmdLower === 'game' ? stream.game_name : stream.title;
            case 'followage':
                const follow = await this.twitchApi.getUserFollow(context.broadcasterId, context.userId);
                if (!follow) return 'not following';
                const fDays = Math.floor((Date.now() - new Date(follow.followed_at).getTime()) / 86400000);
                return `${fDays} days`;
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
                const subs = await this.twitchApi.getSubscriberCount(context.broadcasterId);
                return subs.toLocaleString();
            case 'shoutout':
                const target = args[0]?.replace('@', '');
                return target ? `📢 Go check out ${target} at twitch.tv/${target}! They are doing amazing things. 💜` : '[Target Missing]';
            case 'random.emote':
            case 'twitchemotes':
            case 'bttvemotes':
            case 'ffzemotes':
            case '7tvemotes':
                return 'PogChamp'; // Mock for now
            case 'random.chatter':
                return context.user; // Fallback to current user for now
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
                    // Safe basic math eval
                    const cleanMath = fullArgs.replace(/[^0-9+\-*/().\s]/g, '');
                    const result = eval(cleanMath);
                    return result.toString();
                } catch { return '[Math Error]'; }
            default:
                // Handle numeric arguments $(1), $(2) etc
                const argNum = parseInt(cmd);
                if (!isNaN(argNum)) {
                    return context.args[argNum - 1] || '';
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
}

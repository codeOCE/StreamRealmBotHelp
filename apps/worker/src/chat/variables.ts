/**
 * Command response variable parser — ported from the NestJS VariableService
 * (apps/api/src/bot/variable.service.ts) to run in the Worker chat pipeline.
 *
 * Pure string logic lives here; anything that needs the network or DB goes
 * through the injected `VariableResolvers` so the parser is unit-testable and
 * the pipeline decides how lookups are served (Helix, Supabase, creator token).
 *
 * Differences from the NestJS version (deliberate):
 *  - `$(eval ...)` is NOT supported. Running chatter-influenced JS via
 *    `new Function` inside the multi-tenant Worker is an injection hazard the
 *    old single-box bot tolerated; imported Nightbot commands that use it get a
 *    visible placeholder instead.
 */

export interface ParseContext {
  /** Chatter display name. */
  user: string;
  /** Chatter Twitch id. */
  userId: string;
  /** Channel login (no leading #). */
  channel: string;
  /** Broadcaster Twitch id. */
  broadcasterId: string;
  /** Usage count of the triggering command (after increment). */
  count: number;
  /** Words after the trigger (or regex capture groups). */
  args: string[];
}

/** Async lookups the parser may need. All optional — absent = placeholder. */
export interface VariableResolvers {
  /** Current category/title for a broadcaster id. */
  getChannelInfo?(broadcasterId: string): Promise<{ game_name?: string; title?: string } | null>;
  /** Live stream info (null when offline). */
  getStreamInfo?(broadcasterId: string): Promise<{ started_at: string } | null>;
  /** Resolve a login to a Twitch user id. */
  getUserId?(login: string): Promise<string | null>;
  /** When `userId` followed the broadcaster (null = not following). */
  getFollowedAt?(userId: string): Promise<string | null>;
  /** Tracked watchtime minutes for a chatter in this channel. */
  getWatchtimeMinutes?(twitchUserId: string): Promise<number>;
  /** Usage count of an arbitrary command by trigger. */
  getCommandCount?(trigger: string): Promise<number>;
  /** Free-text weather lookup (wttr.in in production). */
  getWeather?(location: string): Promise<string | null>;
  /** $(urlfetch url) — GET a URL and return its body text (caller caps size/time). */
  fetchUrl?(url: string): Promise<string | null>;
}

const MAX_ITERATIONS = 5;

/**
 * Convert external bot syntax (StreamElements `${...}`, dotted aliases) to the
 * native `$(...)` format. Shared with the commands import route.
 */
export function normalizeSyntax(input: string): string {
  if (!input) return '';
  let result = input;
  let iteration = 0;
  while (result.includes('${') && iteration < 10) {
    iteration++;
    const next = result.replace(/\$\{([^{}]+)\}/g, (_m, inner) => `$(${inner})`);
    if (next === result) break;
    result = next;
  }
  const aliasMap: Record<string, string> = {
    'channel.name': 'channel',
    'user.name': 'user',
    'sender.name': 'sender',
    'touser.name': 'touser',
  };
  result = result.replace(/\$\(([^()]+)\)/g, (_m, inner) => {
    let normalized = String(inner).trim();
    if (aliasMap[normalized]) normalized = aliasMap[normalized];
    return `$(${normalized})`;
  });
  return result;
}

/** Render a response template: resolve innermost $(...) tags, then legacy {x}. */
export async function parseVariables(
  input: string,
  context: ParseContext,
  resolvers: VariableResolvers = {},
): Promise<string> {
  let result = normalizeSyntax(input);
  let iteration = 0;

  while (result.includes('$(') && iteration < MAX_ITERATIONS) {
    iteration++;
    const match = result.match(/\$\(([^()]+)\)/);
    if (!match) break;
    const value = await resolveVariable(match[1].trim(), context, resolvers);
    result = result.replace(match[0], value);
  }

  // Legacy curly-brace variables ({user} etc.) from imported commands.
  result = result.replace(/{user}/gi, context.user);
  result = result.replace(/{count}/gi, context.count.toString());
  result = result.replace(/{touser}/gi, touser(context));
  result = result.replace(/{channel}/gi, context.channel.replace('#', ''));
  return result;
}

function touser(context: ParseContext): string {
  return context.args.length > 0 ? context.args[0].replace('@', '') : context.user;
}

function formatDays(fromIso: string): string {
  const days = Math.floor((Date.now() - new Date(fromIso).getTime()) / 86_400_000);
  return `${days} days`;
}

async function resolveVariable(
  content: string,
  context: ParseContext,
  r: VariableResolvers,
): Promise<string> {
  const [cmd, ...args] = content.split(' ');
  const fullArgs = args.join(' ');
  const cmdLower = cmd.toLowerCase();

  switch (cmdLower) {
    case 'eval':
      return '[eval is not supported]';
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
      if (args.length > 0 && r.getCommandCount) {
        return String(await r.getCommandCount(args[0].replace('!', '')));
      }
      return context.count.toString();
    case 'query':
      return context.args.join(' ');
    case 'touser':
      return touser(context);
    case 'touserid': {
      if (context.args.length > 0 && r.getUserId) {
        return (await r.getUserId(context.args[0].replace('@', ''))) || 'unknown';
      }
      return context.userId;
    }
    case 'random.pick': {
      const options =
        fullArgs.match(/"(.+?)"/g)?.map((o) => o.replace(/"/g, '')) ||
        fullArgs.split(',').map((s) => s.trim()).filter((s) => s);
      return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : 'No options';
    }
    case 'uptime':
    case 'uptimelength': {
      const stream = r.getStreamInfo ? await r.getStreamInfo(context.broadcasterId) : null;
      if (!stream) return 'offline';
      const diff = Date.now() - new Date(stream.started_at).getTime();
      const hours = Math.floor(diff / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      return `${hours}h ${minutes}m`;
    }
    case 'game':
    case 'title': {
      if (!r.getChannelInfo) return 'Unknown';
      let targetId = context.broadcasterId;
      if (args.length > 0 && args[0].startsWith('@') && r.getUserId) {
        targetId = (await r.getUserId(args[0].replace('@', ''))) || targetId;
      }
      const info = await r.getChannelInfo(targetId);
      return (cmdLower === 'game' ? info?.game_name : info?.title) || 'Unknown';
    }
    case 'followage': {
      if (!r.getFollowedAt) return 'unknown';
      let targetId = context.userId;
      const targetLogin = args.length > 0 ? args[0].replace('@', '') : null;
      if (targetLogin && targetLogin.toLowerCase() !== context.user.toLowerCase()) {
        if (!r.getUserId) return 'unknown user';
        const id = await r.getUserId(targetLogin);
        if (!id) return 'unknown user';
        targetId = id;
      }
      const followedAt = await r.getFollowedAt(targetId);
      return followedAt ? formatDays(followedAt) : 'not following';
    }
    case 'watchtime':
    case 'user.time_online': {
      if (!r.getWatchtimeMinutes) return '0m';
      let targetId = context.userId;
      const targetLogin = args.length > 0 ? args[0].replace('@', '') : null;
      if (targetLogin && targetLogin.toLowerCase() !== context.user.toLowerCase() && r.getUserId) {
        const id = await r.getUserId(targetLogin);
        if (!id) return '0m';
        targetId = id;
      }
      const mins = await r.getWatchtimeMinutes(targetId);
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
    case 'getcount':
      if (args.length === 0 || !r.getCommandCount) return '0';
      return String(await r.getCommandCount(args[0].replace('!', '')));
    case 'weather':
      if (!fullArgs) return '[Location Missing]';
      if (!r.getWeather) return '[Weather Service Unavailable]';
      return (await r.getWeather(fullArgs)) ?? '[Weather Error]';
    case 'urlfetch':
    case 'customapi': {
      if (!fullArgs) return '[URL Missing]';
      if (!/^https?:\/\//i.test(fullArgs)) return '[urlfetch needs an http(s) URL]';
      if (!r.fetchUrl) return '[urlfetch unavailable]';
      const body = await r.fetchUrl(fullArgs);
      if (body === null) return '[urlfetch error]';
      // Single-line + Twitch chat budget; also neuter `$(` so a remote response
      // can't inject further variable tags into the resolve loop.
      return body.replace(/\s+/g, ' ').replace(/\$\(/g, '$ (').trim().slice(0, 400);
    }
    case 'random.range':
    case 'random.number':
    case 'random': {
      const numRange = fullArgs.includes('-') ? fullArgs.split('-') : fullArgs.split(' ');
      let min = 0;
      let max = 100;
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
    }
    default: {
      // $(1:) — args from position N to end.
      if (cmd.endsWith(':')) {
        const startNum = parseInt(cmd.slice(0, -1));
        if (!isNaN(startNum) && startNum > 0) {
          const val = context.args.slice(startNum - 1).join(' ');
          if (!val && startNum === 1) return context.user;
          return val;
        }
      }
      // $(1), $(2) — positional args.
      const argNum = parseInt(cmd);
      if (!isNaN(argNum)) {
        const val = context.args[argNum - 1];
        if (!val && argNum === 1) return context.user;
        return val || '';
      }
      // StreamElements $(random.1-100).
      if (/^random\.\d+-\d+$/.test(cmdLower)) {
        const [minStr, maxStr] = cmdLower.replace('random.', '').split('-');
        const min = parseInt(minStr);
        const max = parseInt(maxStr);
        if (!isNaN(min) && !isNaN(max)) {
          return Math.floor(Math.random() * (max - min + 1) + min).toString();
        }
      }
      // Break the resolve loop on unknown tags.
      if (cmdLower.startsWith('unknown:')) return `(${content})`;
      return `$(unknown:${cmd})`;
    }
  }
}

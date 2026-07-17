import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { createSupabaseClient, botSchema } from '../lib/supabase';
import { broadcast } from '../realtime';
import { getCreatorCreds } from '../token-do';
import type { CreatorCreds } from '../token-do';
import { sendChatMessage } from '../lib/creator-chat';
import { getPlatformBotCreds } from '../lib/platform-bot';
import type { BotCreds } from '../lib/platform-bot';
import {
  getAppAccessToken,
  getChannelInfo,
  getStreamInfo,
  getUserByLogin,
  getFollowedAt,
  banUser,
  deleteChatMessage,
  createClip,
} from '../lib/twitch';
import {
  EIGHT_BALL_ANSWERS,
  DAD_JOKES,
  FACTS,
  LURK_MESSAGES,
  UNLURK_MESSAGES,
  pick,
  rollDice,
  coinFlip,
  lovePercent,
} from './fun';
import { SHOP_TRIGGERS, handleShopCommand } from './shop';
import { SONG_TRIGGERS, handleSongCommand } from './songrequest';
import { GIVEAWAY_TRIGGERS, handleGiveawayCommand } from './giveaway';
import { POLL_TRIGGERS, handlePollCommand } from './poll';
import { parseVariables, normalizeSyntax, type VariableResolvers, type ParseContext } from './variables';
import { evaluateRules, type ModRule, type UserLevel } from './moderation';
import { buildEmoteMap, emoteUrlsInText, type EmoteRow } from './emotes';
import { shieldReason, type ShieldSettings } from './shield';
import {
  type ChatEvent,
  type CommandRow,
  userLevelFromEvent,
  hasPermission,
  parseBang,
  matchCommand,
  matchRegexCommands,
  offGlobalCooldown,
  offUserCooldown,
  pickCommandResponses,
} from './logic';

/**
 * The serverless chat bot (ADR-0001 follow-up #3). Twitch pushes every chat
 * message for connected channels to /api/eventsub/callback; eventsub.ts
 * verifies the signature, ACKs immediately, and runs this pipeline in
 * ctx.waitUntil. Replaces the NestJS ChatHandlerService + tmi.js IRC bot:
 *
 *   1. moderation rules  → Helix timeout/ban/delete, acting as the broadcaster
 *   2. !commands         → built-ins + custom + regex, replies via Helix chat
 *   3. loyalty           → +XP per message, level-ups, viewer profile upsert
 *   4. timers            → bumps the per-channel chat-line counter (cron gate)
 *   5. overlays          → broadcasts the message to chat widgets (RealtimeHub)
 *
 * Per-message state the old bot kept in process memory (cooldowns, permits,
 * line counters) lives in Postgres — see migrations/013_chat_pipeline.sql.
 */

const XP_PER_MESSAGE = 10;
const PERMIT_MINUTES = 2;
const MAX_REPLIES_PER_MESSAGE = 3;

// XP curve — mirrors XpService / routes/loyalty.ts.
const xpForNextLevel = (level: number) => Math.floor(level * 100 * Math.pow(1.2, level));

/** Normalize a raw EventSub channel.chat.message payload. Null when malformed. */
export function parseChatEvent(e: Record<string, any>): ChatEvent | null {
  const broadcasterTwitchId = String(e?.broadcaster_user_id ?? '');
  const chatterTwitchId = String(e?.chatter_user_id ?? '');
  const text = String(e?.message?.text ?? '').trim();
  if (!broadcasterTwitchId || !chatterTwitchId || !text) return null;
  return {
    broadcasterTwitchId,
    broadcasterLogin: String(e.broadcaster_user_login ?? ''),
    chatterTwitchId,
    chatterLogin: String(e.chatter_user_login ?? ''),
    chatterName: String(e.chatter_user_name ?? e.chatter_user_login ?? 'viewer'),
    messageId: String(e.message_id ?? ''),
    text,
    badges: new Set(
      Array.isArray(e.badges) ? e.badges.map((b: any) => String(b?.set_id ?? '')).filter(Boolean) : [],
    ),
    // undefined (not []) when fragments are absent, so moderation can tell
    // "no emotes" apart from "no fragment data" (dev simulator).
    emotes: Array.isArray(e?.message?.fragments)
      ? e.message.fragments
          .filter((f: any) => f?.type === 'emote' && f?.emote?.id)
          .map((f: any) => `https://static-cdn.jtvnw.net/emoticons/v2/${f.emote.id}/default/dark/3.0`)
      : undefined,
  };
}

export async function processChatMessage(env: Env, ev: ChatEvent): Promise<void> {
  const supabase = createSupabaseClient(env);
  const bot = botSchema(supabase);

  const { data: streamer } = await supabase
    .from('streamers')
    .select('id')
    .eq('twitch_id', ev.broadcasterTwitchId)
    .maybeSingle();
  if (!streamer) return;
  const streamerId: string = streamer.id;
  const level = userLevelFromEvent(ev);

  // Independent per-message reads — fire together instead of one after
  // another. This used to be 3 sequential round trips (settings, commands,
  // mod rules) before the bot could even start deciding what to do.
  const needsModRules = level !== 'MODERATOR' && level !== 'BROADCASTER';
  const [{ data: tenant }, { data: cmdRows }, modRulesRes] = await Promise.all([
    bot.from('tenants').select('settings').eq('streamer_id', streamerId).maybeSingle(),
    bot
      .from('commands')
      .select('id, trigger, enabled, cooldown, user_cooldown, user_level, responses, response_type, response_mode, aliases, usages, is_built_in, is_regex, last_used_at')
      .eq('streamer_id', streamerId)
      .eq('enabled', true),
    needsModRules
      ? bot.from('mod_rules').select('id, type, enabled, settings').eq('streamer_id', streamerId).eq('enabled', true)
      : Promise.resolve({ data: null as ModRule[] | null }),
  ]);
  const settings = (tenant?.settings ?? {}) as Record<string, any>;
  const commands = (cmdRows ?? []).map((c: any) => ({
    ...c,
    responses: Array.isArray(c.responses) ? c.responses : [],
    aliases: Array.isArray(c.aliases) ? c.aliases : [],
  })) as CommandRow[];

  // Lazily-fetched shared resources (creator creds, app token, command list).
  let credsPromise: Promise<CreatorCreds | null> | null = null;
  const creds = () => (credsPromise ??= getCreatorCreds(env, streamerId).catch(() => null));
  let appTokenPromise: Promise<string | null> | null = null;
  const appToken = () => (appTokenPromise ??= getAppAccessToken(env).catch(() => null));
  let botCredsPromise: Promise<BotCreds | null> | null = null;
  const botCreds = () => (botCredsPromise ??= getPlatformBotCreds(env, supabase).catch(() => null));

  // Unified outbound sender: posts as the dedicated platform bot when connected,
  // else as the broadcaster. Mod ACTIONS (ban/delete) still use the creator token.
  const say = async (message: string, replyId?: string): Promise<boolean> => {
    const b = await botCreds();
    if (b) {
      // Twitch only shows the "Bot" chat badge on messages sent with an APP
      // access token (not the bot's own user token) — see BOT_SCOPES/channel:bot
      // in lib/twitch.ts, both already granted. Falls back to the bot's user
      // token (today's working behavior, just badge-less) if the app token
      // call ever fails.
      const app = await appToken();
      const token = app ?? b.token;
      return sendChatMessage(env, { token, broadcasterId: ev.broadcasterTwitchId, senderId: b.botUserId }, message, replyId);
    }
    const c = await creds();
    return c ? sendChatMessage(env, c, message, replyId) : false;
  };

  // ── 0. Shield Mode (hate-raid / follow-bot protection) ─────────────────────
  // Only gates plain viewers; subs/VIPs/mods are trusted and exempt.
  if (settings.shield?.enabled && level === 'VIEWER') {
    const blocked = await enforceShield(env, supabase, streamerId, ev, settings.shield, creds, appToken, say);
    if (blocked) return;
  }

  // ── 1. Moderation ──────────────────────────────────────────────────────────
  if (needsModRules) {
    const blocked = await moderate(env, supabase, streamerId, ev, level, (modRulesRes.data ?? []) as ModRule[], creds, say);
    if (blocked) return; // match old behavior: no XP/log/counter for removed messages
  }

  // ── 2. Commands ────────────────────────────────────────────────────────────
  const helpers: CommandHelpers = { env, supabase, streamerId, settings, ev, level, commands, creds, appToken, say };

  const bang = parseBang(ev.text);
  if (bang && SHOP_TRIGGERS.has(bang.trigger)) {
    // The Royal Shop: !shop / !buy run before command lookup (no seeded rows).
    await handleShopCommand({
      env,
      supabase,
      streamerId,
      viewerTwitchId: ev.chatterTwitchId,
      viewerName: ev.chatterName,
      trigger: bang.trigger,
      args: bang.args,
      say,
    });
  } else if (bang && GIVEAWAY_TRIGGERS.has(bang.trigger)) {
    // Giveaways: !giveaway / !enter run before command lookup (no seeded rows).
    await handleGiveawayCommand({
      env,
      supabase,
      streamerId,
      viewerTwitchId: ev.chatterTwitchId,
      viewerName: ev.chatterName,
      isSubscriber: ev.badges.has('subscriber') || ev.badges.has('founder'),
      trigger: bang.trigger,
      say,
    });
  } else if (bang && SONG_TRIGGERS.has(bang.trigger) && settings.spotify?.accessToken) {
    // Song requests: !sr / !song via the creator's Spotify. Only intercepts the
    // triggers when Spotify is connected, so !song can stay a custom command.
    await handleSongCommand({
      env,
      supabase,
      streamerId,
      settings,
      level,
      viewerName: ev.chatterName,
      trigger: bang.trigger,
      args: bang.args,
      say,
    });
  } else if (bang && POLL_TRIGGERS.has(bang.trigger)) {
    // Polls: !poll / !vote run before command lookup (no seeded rows).
    await handlePollCommand({
      env,
      supabase,
      streamerId,
      viewerTwitchId: ev.chatterTwitchId,
      viewerName: ev.chatterName,
      trigger: bang.trigger,
      args: bang.args,
      say,
    });
  } else if (bang) {
    const handled = await handleBuiltIn(helpers, bang.trigger, bang.args);
    if (!handled) {
      const command = matchCommand(commands, bang.trigger);
      if (command && !command.is_built_in) await runCommand(helpers, command, bang.args);
    }
  } else {
    for (const m of matchRegexCommands(commands, ev.text)) {
      await runCommand(helpers, m.command, m.args);
    }
  }

  // ── 3–5. Loyalty, counters, logs, overlays (best-effort, independent) ──────
  const loyaltyEnabled = settings.loyalty?.enabled !== false;
  await Promise.allSettled([
    loyaltyEnabled ? addXp(supabase, streamerId, ev, XP_PER_MESSAGE) : Promise.resolve(),
    bot.rpc('bump_chat_activity', { p_streamer_id: streamerId }),
    bot.from('chat_logs').insert({ streamer_id: streamerId, viewer_id: ev.chatterTwitchId, message: ev.text.slice(0, 500) }),
    emitToOverlays(env, supabase, streamerId, ev),
  ]);
}

// ── Moderation ────────────────────────────────────────────────────────────────

async function moderate(
  env: Env,
  supabase: SupabaseClient,
  streamerId: string,
  ev: ChatEvent,
  level: UserLevel,
  rules: ModRule[],
  creds: () => Promise<CreatorCreds | null>,
  say: (message: string, replyId?: string) => Promise<boolean>,
): Promise<boolean> {
  const bot = botSchema(supabase);
  if (!rules.length) return false;

  const violation = evaluateRules(rules, ev.text, level, ev.emotes?.length);
  if (!violation) return false;

  // Permit check only once a violation is found (saves a query per message).
  const { data: permit } = await bot
    .from('permits')
    .select('expires_at')
    .eq('streamer_id', streamerId)
    .eq('user_login', ev.chatterLogin.toLowerCase())
    .maybeSingle();
  if (permit && new Date(permit.expires_at).getTime() > Date.now()) return false;

  const c = await creds();
  if (c) {
    const reason = `Moderation: ${violation.rule.type}`;
    if (violation.action === 'DELETE') {
      // Needs moderator:manage:chat_messages; older tokens fall back to a 1s timeout.
      const deleted = ev.messageId && (await deleteChatMessage(env, c.token, c.broadcasterId, ev.messageId));
      if (!deleted) await banUser(env, c.token, c.broadcasterId, ev.chatterTwitchId, 1, reason);
    } else if (violation.action === 'TIMEOUT') {
      await banUser(env, c.token, c.broadcasterId, ev.chatterTwitchId, violation.duration, reason);
    } else if (violation.action === 'BAN') {
      await banUser(env, c.token, c.broadcasterId, ev.chatterTwitchId, null, reason);
    }
    if (!violation.silent || violation.action === 'WARN') {
      const feedback = await parseVariables(violation.feedback, baseContext(ev, 0, []), {});
      await say(`@${ev.chatterName}, ${feedback}`);
    }
  }

  await bot.from('audit_logs').insert({
    streamer_id: streamerId,
    action: violation.action,
    actor: 'Sentinel',
    target: ev.chatterLogin,
    metadata: { ruleType: violation.rule.type, duration: violation.duration, message: ev.text.slice(0, 100) },
  });
  return true;
}

// ── Shield Mode ─────────────────────────────────────────────────────────────

/**
 * Hate-raid / follow-bot protection. When the streamer flips Shield Mode on, the
 * first message from any *new* account (no viewer profile yet) is checked: too
 * young, or not following, → timeout/delete/ban. Returns true when the message
 * was blocked. The new-face gate keeps the Helix calls bounded to exactly the
 * raid vector — established chatters never trigger a lookup.
 *
 * ponytail: manual toggle only. Auto-arming on a follow/chat spike is the next
 * rung — add a windowed counter in eventsub.ts when someone asks for it.
 */
async function enforceShield(
  env: Env,
  supabase: SupabaseClient,
  streamerId: string,
  ev: ChatEvent,
  shield: ShieldSettings,
  creds: () => Promise<CreatorCreds | null>,
  appToken: () => Promise<string | null>,
  say: (message: string, replyId?: string) => Promise<boolean>,
): Promise<boolean> {
  const bot = botSchema(supabase);
  const { data: known } = await bot
    .from('viewer_profiles')
    .select('id')
    .eq('streamer_id', streamerId)
    .eq('twitch_user_id', ev.chatterTwitchId)
    .maybeSingle();
  if (known) return false; // trusted regular — skip the lookups

  // Account age (only when the rule needs it).
  let ageDays: number | null = null;
  if (Number(shield.maxAccountAgeDays ?? 7) > 0) {
    const token = await appToken();
    const u = token ? await getUserByLogin(env, token, ev.chatterLogin) : null;
    if (u?.created_at) ageDays = (Date.now() - new Date(u.created_at).getTime()) / 86_400_000;
  }

  // Follow check only if requested AND age hasn't already tripped the block
  // (saves the extra Helix call in the common case).
  let following: boolean | null = null;
  if (shield.requireFollow && shieldReason({ ageDays, following: null }, shield) === null) {
    const c = await creds();
    following = c ? Boolean(await getFollowedAt(env, c.token, c.broadcasterId, ev.chatterTwitchId)) : null;
  }

  const reason = shieldReason({ ageDays, following }, shield);
  if (!reason) return false;

  const action = shield.action === 'ban' ? 'BAN' : shield.action === 'delete' ? 'DELETE' : 'TIMEOUT';
  const c = await creds();
  if (c) {
    const banReason = `Shield Mode: ${reason}`;
    if (action === 'DELETE') {
      const deleted = ev.messageId && (await deleteChatMessage(env, c.token, c.broadcasterId, ev.messageId));
      if (!deleted) await banUser(env, c.token, c.broadcasterId, ev.chatterTwitchId, 1, banReason);
    } else if (action === 'BAN') {
      await banUser(env, c.token, c.broadcasterId, ev.chatterTwitchId, null, banReason);
    } else {
      await banUser(env, c.token, c.broadcasterId, ev.chatterTwitchId, Number(shield.duration ?? 600), banReason);
    }
    if (!shield.silent) await say(`@${ev.chatterName}, blocked by Shield Mode.`);
  }

  await bot.from('audit_logs').insert({
    streamer_id: streamerId,
    action,
    actor: 'Shield',
    target: ev.chatterLogin,
    metadata: { reason, message: ev.text.slice(0, 100) },
  });
  return true;
}

// ── Commands ──────────────────────────────────────────────────────────────────

interface CommandHelpers {
  env: Env;
  supabase: SupabaseClient;
  streamerId: string;
  settings: Record<string, any>;
  ev: ChatEvent;
  level: UserLevel;
  commands: CommandRow[];
  creds: () => Promise<CreatorCreds | null>;
  appToken: () => Promise<string | null>;
  /** Bot-aware sender (platform bot when connected, else broadcaster). */
  say: (message: string, replyId?: string) => Promise<boolean>;
}

function baseContext(ev: ChatEvent, count: number, args: string[]): ParseContext {
  return {
    user: ev.chatterName,
    userId: ev.chatterTwitchId,
    channel: ev.broadcasterLogin,
    broadcasterId: ev.broadcasterTwitchId,
    count,
    args,
  };
}

function buildResolvers(h: CommandHelpers): VariableResolvers {
  const { env, supabase, streamerId, ev } = h;
  return {
    getChannelInfo: async (broadcasterId) => {
      const token = await h.appToken();
      return token ? getChannelInfo(env, token, broadcasterId) : null;
    },
    getStreamInfo: async (userId) => {
      const token = await h.appToken();
      return token ? getStreamInfo(env, token, userId) : null;
    },
    getUserId: async (login) => {
      const token = await h.appToken();
      const u = token ? await getUserByLogin(env, token, login) : null;
      return u?.id ?? null;
    },
    getFollowedAt: async (userId) => {
      const c = await h.creds();
      return c ? getFollowedAt(env, c.token, c.broadcasterId, userId) : null;
    },
    getWatchtimeMinutes: async (twitchUserId) => {
      const { data } = await botSchema(supabase)
        .from('viewer_profiles')
        .select('watch_time')
        .eq('streamer_id', streamerId)
        .eq('twitch_user_id', twitchUserId)
        .maybeSingle();
      return data?.watch_time ?? 0;
    },
    getCommandCount: async (trigger) => {
      const cmd = h.commands.find((c) => c.trigger.toLowerCase() === trigger.toLowerCase());
      return cmd?.usages ?? 0;
    },
    getWeather: async (location) => {
      try {
        const res = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=3`, {
          signal: AbortSignal.timeout(4000),
        });
        return res.ok ? (await res.text()).trim() : null;
      } catch {
        return null;
      }
    },
    fetchUrl: async (url) => {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(4000),
          headers: { 'User-Agent': 'CreatorCastle/1.0 (urlfetch)' },
        });
        if (!res.ok) return null;
        // Read at most ~4KB — urlfetch APIs return short plain-text lines.
        return (await res.text()).slice(0, 4096);
      } catch {
        return null;
      }
    },
  };
}

/** Send a rendered command response respecting its response type. */
async function sendResponses(
  h: CommandHelpers,
  command: Pick<CommandRow, 'responses' | 'response_type' | 'response_mode'>,
  context: ParseContext,
): Promise<void> {
  const resolvers = buildResolvers(h);
  let sent = 0;
  for (const response of pickCommandResponses(command.responses, command.response_mode)) {
    if (sent >= MAX_REPLIES_PER_MESSAGE) break;
    const raw = String(response ?? '');
    if (!raw.trim()) continue;
    const rendered = await parseVariables(raw, context, resolvers);
    const type = command.response_type || 'SAY';
    const ok =
      type === 'MENTION'
        ? await h.say(`@${context.user}, ${rendered}`)
        : await h.say(rendered, type === 'REPLY' ? h.ev.messageId : undefined);
    if (ok) sent++;
  }
}

/** Cooldown + permission gate, respond, then usage/cooldown bookkeeping. */
async function runCommand(h: CommandHelpers, command: CommandRow, args: string[]): Promise<void> {
  if (!hasPermission(h.level, command.user_level)) return;
  if (!offGlobalCooldown(command.cooldown, command.last_used_at)) return;

  const bot = botSchema(h.supabase);
  if (command.user_cooldown > 0) {
    const { data: cd } = await bot
      .from('command_cooldowns')
      .select('used_at')
      .eq('command_id', command.id)
      .eq('user_twitch_id', h.ev.chatterTwitchId)
      .maybeSingle();
    if (!offUserCooldown(command.user_cooldown, cd?.used_at ?? null)) return;
  }

  // Reply first with an optimistic count, instead of waiting on two write
  // round trips before the viewer sees anything. Usage/cooldown bookkeeping
  // settles a beat later — it only has to be done before the *next* trigger,
  // not before this reply.
  await sendResponses(h, command, baseContext(h.ev, command.usages + 1, args));

  await Promise.all([
    bot.rpc('increment_command_usage', { p_command_id: command.id }),
    command.user_cooldown > 0
      ? bot
          .from('command_cooldowns')
          .upsert(
            { command_id: command.id, user_twitch_id: h.ev.chatterTwitchId, used_at: new Date().toISOString() },
            { onConflict: 'command_id,user_twitch_id' },
          )
      : Promise.resolve(),
  ]);
}

/**
 * Built-in commands (uptime, loyalty stats, mod tools…). Only run when the
 * seeded built-in row exists, is enabled, and the chatter passes its gates.
 * Returns true when the trigger was a built-in (even if gated), so custom
 * lookup is skipped.
 */
async function handleBuiltIn(h: CommandHelpers, trigger: string, args: string[]): Promise<boolean> {
  const command = h.commands.find((c) => c.is_built_in && c.trigger.toLowerCase() === trigger);
  if (!command) return false;
  if (!hasPermission(h.level, command.user_level)) return true;
  if (!offGlobalCooldown(command.cooldown, command.last_used_at)) return true;

  const { env, supabase, streamerId, ev } = h;
  const bot = botSchema(supabase);
  const say = h.say;

  switch (trigger) {
    case 'uptime': {
      const token = await h.appToken();
      const stream = token ? await getStreamInfo(env, token, ev.broadcasterTwitchId) : null;
      if (stream) {
        const diff = Date.now() - new Date(stream.started_at).getTime();
        await say(`Stream has been live for ${Math.floor(diff / 3_600_000)}h ${Math.floor((diff % 3_600_000) / 60_000)}m`);
      } else {
        await say('Stream is currently offline.');
      }
      break;
    }
    case 'game':
    case 'title': {
      const token = await h.appToken();
      const info = token ? await getChannelInfo(env, token, ev.broadcasterTwitchId) : null;
      if (info) {
        await say(trigger === 'game' ? `Current game: ${info.game_name || 'Unknown'}` : `Current title: ${info.title}`);
      }
      break;
    }
    case 'stats':
    case 'xp': {
      const { data: p } = await bot
        .from('viewer_profiles')
        .select('level, xp, watch_time')
        .eq('streamer_id', streamerId)
        .eq('twitch_user_id', ev.chatterTwitchId)
        .maybeSingle();
      await say(
        p
          ? `${ev.chatterName} | Level: ${p.level} | XP: ${p.xp} | Watchtime: ${Math.floor(p.watch_time / 60)}h`
          : `${ev.chatterName}, you don't have any stats yet. Start chatting to earn XP!`,
      );
      break;
    }
    case 'top':
    case 'leaderboard': {
      const { data: topUsers } = await bot
        .from('viewer_profiles')
        .select('username, xp')
        .eq('streamer_id', streamerId)
        .order('xp', { ascending: false })
        .limit(3);
      const board = (topUsers ?? []).map((u: any, i: number) => `${i + 1}. ${u.username} (${u.xp} XP)`).join(' | ');
      await say(board ? `Top XP Leaders: ${board}` : 'No XP earned yet — start chatting!');
      break;
    }
    case 'watchtime': {
      const { data: p } = await bot
        .from('viewer_profiles')
        .select('watch_time')
        .eq('streamer_id', streamerId)
        .eq('twitch_user_id', ev.chatterTwitchId)
        .maybeSingle();
      await say(
        p
          ? `${ev.chatterName}, you have watched for ${Math.floor(p.watch_time / 60)}h ${p.watch_time % 60}m`
          : `${ev.chatterName}, you don't have any watchtime yet!`,
      );
      break;
    }
    case 'followage': {
      const c = await h.creds();
      const followedAt = c ? await getFollowedAt(env, c.token, c.broadcasterId, ev.chatterTwitchId) : null;
      await say(
        followedAt
          ? `${ev.chatterName}, you have been following for ${Math.floor((Date.now() - new Date(followedAt).getTime()) / 86_400_000)} days!`
          : `${ev.chatterName}, you are not following yet!`,
      );
      break;
    }
    case 'commands':
    case 'help': {
      const custom = h.commands.filter((c) => !c.is_built_in && !c.is_regex).map((c) => `!${c.trigger}`);
      const builtIn = h.commands
        .filter(
          (c) =>
            c.is_built_in &&
            !['addcom', 'editcom', 'delcom', 'permit', 'shoutout', 'so', 'addquote', 'delquote'].includes(c.trigger),
        )
        .map((c) => `!${c.trigger}`);
      await say(`Available commands: ${builtIn.join(', ')}${custom.length ? ` | Custom: ${custom.join(', ')}` : ''}`.slice(0, 480));
      break;
    }
    case 'socials': {
      const socials = h.settings.socials;
      if (socials && typeof socials === 'object' && Object.keys(socials).length) {
        await say(
          `Follow ${ev.broadcasterLogin}: ` +
            Object.entries(socials)
              .filter(([, v]) => typeof v === 'string' && v)
              .map(([k, v]) => `${k}: ${v}`)
              .join(' | '),
        );
      } else {
        await say('Follow us on our socials! [Add your social links in the dashboard]');
      }
      break;
    }
    case 'ping':
      await say('Pong! CreatorCastle bot is online and operational.');
      break;
    case '8ball': {
      if (!args.length) {
        await say(`${ev.chatterName}, you need to ask the 8-ball a question!`);
      } else {
        await say(`${ev.chatterName}, the magic 8-ball says: ${pick(EIGHT_BALL_ANSWERS)}`);
      }
      break;
    }
    case 'dice':
    case 'roll': {
      const roll = rollDice(args[0]);
      await say(
        roll
          ? `${ev.chatterName} rolls ${args[0]?.trim() || 'a d6'}… ${roll.detail}!`
          : `${ev.chatterName}, usage: !${trigger} [20 | 2d6]`,
      );
      break;
    }
    case 'coinflip':
    case 'flip':
      await say(`${ev.chatterName} flips a coin… it's ${coinFlip()}!`);
      break;
    case 'dadjoke':
      await say(pick(DAD_JOKES));
      break;
    case 'fact':
      await say(`Fact: ${pick(FACTS)}`);
      break;
    case 'hug': {
      const target = args[0]?.replace('@', '');
      await say(target ? `${ev.chatterName} gives ${target} a big warm hug! 🤗` : `${ev.chatterName} hugs the whole chat! 🤗`);
      break;
    }
    case 'love': {
      const target = args[0]?.replace('@', '');
      if (!target) {
        await say(`${ev.chatterName}, usage: !love @user`);
      } else {
        const pct = lovePercent(ev.chatterName, target);
        await say(`💘 ${ev.chatterName} and ${target} are ${pct}% compatible!`);
      }
      break;
    }
    case 'lurk':
      await say(`${ev.chatterName} ${pick(LURK_MESSAGES)}`);
      break;
    case 'unlurk':
      await say(`${ev.chatterName} ${pick(UNLURK_MESSAGES)}`);
      break;
    case 'quote': {
      const num = parseInt(args[0] ?? '');
      let q: { quote_number: number; text: string; game: string | null; created_at: string } | null = null;
      if (!isNaN(num)) {
        const { data } = await bot
          .from('quotes')
          .select('quote_number, text, game, created_at')
          .eq('streamer_id', streamerId)
          .eq('quote_number', num)
          .maybeSingle();
        q = data;
      } else {
        const { data } = await bot.rpc('random_quote', { p_streamer_id: streamerId });
        q = Array.isArray(data) ? data[0] ?? null : data;
      }
      if (!q) {
        await say(isNaN(num) ? 'No quotes saved yet — mods can add one with !addquote.' : `Quote #${num} not found.`);
      } else {
        const year = new Date(q.created_at).getFullYear();
        await say(`Quote #${q.quote_number}: "${q.text}"${q.game ? ` [${q.game}]` : ''} [${year}]`);
      }
      break;
    }
    case 'addquote': {
      const text = args.join(' ').trim();
      if (!text) {
        await say('Usage: !addquote <text>');
        break;
      }
      // Tag the quote with the current game (best-effort).
      const token = await h.appToken();
      const info = token ? await getChannelInfo(env, token, ev.broadcasterTwitchId) : null;
      const { data: qNum, error: qErr } = await bot.rpc('add_quote', {
        p_streamer_id: streamerId,
        p_text: text.slice(0, 400),
        p_added_by: ev.chatterName,
        p_game: info?.game_name ?? null,
      });
      if (qErr) {
        await say('Could not save the quote.');
      } else {
        await audit(supabase, streamerId, 'QUOTE_ADD', ev.chatterName, `#${qNum}`, { text: text.slice(0, 100) });
        await say(`Quote #${qNum} saved!`);
      }
      break;
    }
    case 'delquote': {
      const num = parseInt(args[0] ?? '');
      if (isNaN(num)) {
        await say('Usage: !delquote <number>');
        break;
      }
      const { data: deleted } = await bot
        .from('quotes')
        .delete()
        .eq('streamer_id', streamerId)
        .eq('quote_number', num)
        .select('id');
      if (deleted?.length) {
        await audit(supabase, streamerId, 'QUOTE_DELETE', ev.chatterName, `#${num}`);
        await say(`Quote #${num} deleted.`);
      } else {
        await say(`Quote #${num} not found.`);
      }
      break;
    }
    case 'clip': {
      const c = await h.creds();
      const url = c ? await createClip(env, c.token, c.broadcasterId) : null;
      await say(url ? `Clip created! ${url}` : 'Could not create a clip — is the stream live?');
      break;
    }
    case 'shoutout':
    case 'so': {
      const target = args[0]?.replace('@', '');
      if (target) await say(`Go check out ${target} at twitch.tv/${target}! They are doing amazing things.`);
      break;
    }
    case 'count': {
      const name = (args[0] ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!name) {
        await say(`${ev.chatterName}, usage: !count <name> — e.g. !count deaths`);
        break;
      }
      const { data } = await bot.from('counters').select('value').eq('streamer_id', streamerId).eq('name', name).maybeSingle();
      await say(`${name}: ${data?.value ?? 0}`);
      break;
    }
    case 'addcount': {
      const name = (args[0] ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!name) {
        await say(`Usage: !addcount <name> [amount]`);
        break;
      }
      const delta = parseInt(args[1] ?? '1');
      const { data } = await bot.rpc('bump_counter', { p_streamer_id: streamerId, p_name: name, p_delta: isNaN(delta) ? 1 : delta });
      await say(`${name}: ${Array.isArray(data) ? data[0] : data}`);
      break;
    }
    case 'setcount': {
      const name = (args[0] ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
      const value = parseInt(args[1] ?? '');
      if (!name || isNaN(value)) {
        await say(`Usage: !setcount <name> <value>`);
        break;
      }
      const { data } = await bot.rpc('set_counter', { p_streamer_id: streamerId, p_name: name, p_value: value });
      await say(`${name} set to ${Array.isArray(data) ? data[0] : data}`);
      break;
    }
    case 'permit': {
      const target = args[0]?.replace('@', '').toLowerCase();
      if (target) {
        await bot.from('permits').upsert(
          {
            streamer_id: streamerId,
            user_login: target,
            expires_at: new Date(Date.now() + PERMIT_MINUTES * 60_000).toISOString(),
          },
          { onConflict: 'streamer_id,user_login' },
        );
        await say(`${target} is now permitted to post links for ${PERMIT_MINUTES} minutes.`);
      }
      break;
    }
    case 'addcom': {
      const newTrigger = args[0]?.replace('!', '').toLowerCase();
      const newResponse = args.slice(1).join(' ');
      if (newTrigger && newResponse) {
        const { error: insErr } = await bot.from('commands').insert({
          streamer_id: streamerId,
          trigger: newTrigger,
          responses: [normalizeSyntax(newResponse)],
          enabled: true,
          is_built_in: false,
          user_level: 'VIEWER',
          cooldown: 10,
          category: 'General',
        });
        if (insErr) {
          await say(/duplicate key|unique/i.test(insErr.message) ? `Command !${newTrigger} already exists.` : `Could not add !${newTrigger}.`);
        } else {
          await audit(supabase, streamerId, 'COMMAND_ADD', ev.chatterName, `!${newTrigger}`, { response: newResponse });
          await broadcast(env, `streamer:${streamerId}`, 'commandUpdated', {}).catch(() => undefined);
          await say(`Command !${newTrigger} has been added.`);
        }
      }
      break;
    }
    case 'editcom': {
      const editTrigger = args[0]?.replace('!', '').toLowerCase();
      const editResponse = args.slice(1).join(' ');
      if (editTrigger && editResponse) {
        const target = h.commands.find((c) => !c.is_built_in && c.trigger.toLowerCase() === editTrigger);
        if (target) {
          await bot.from('commands').update({ responses: [normalizeSyntax(editResponse)] }).eq('id', target.id);
          await audit(supabase, streamerId, 'COMMAND_EDIT', ev.chatterName, `!${editTrigger}`, { response: editResponse });
          await broadcast(env, `streamer:${streamerId}`, 'commandUpdated', {}).catch(() => undefined);
          await say(`Command !${editTrigger} has been updated.`);
        } else {
          await say(`Error: Command !${editTrigger} not found or is a built-in.`);
        }
      }
      break;
    }
    case 'delcom': {
      const delTrigger = args[0]?.replace('!', '').toLowerCase();
      if (delTrigger) {
        const target = h.commands.find((c) => !c.is_built_in && c.trigger.toLowerCase() === delTrigger);
        if (target) {
          await bot.from('commands').delete().eq('id', target.id);
          await audit(supabase, streamerId, 'COMMAND_DELETE', ev.chatterName, `!${delTrigger}`);
          await broadcast(env, `streamer:${streamerId}`, 'commandUpdated', {}).catch(() => undefined);
          await say(`Command !${delTrigger} has been deleted.`);
        } else {
          await say(`Error: Command !${delTrigger} not found or is a built-in.`);
        }
      }
      break;
    }
    default:
      // Seeded built-in with no serverless implementation yet — treat as
      // unhandled so a custom command with the same trigger can take over.
      return false;
  }

  await bot.rpc('increment_command_usage', { p_command_id: command.id });
  return true;
}

async function audit(
  supabase: SupabaseClient,
  streamerId: string,
  action: string,
  actor: string,
  target?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await botSchema(supabase)
    .from('audit_logs')
    .insert({ streamer_id: streamerId, action, actor, target, metadata: metadata ?? {} });
}

// ── Loyalty ───────────────────────────────────────────────────────────────────

/**
 * Add chat XP, creating the viewer profile on first sight (the old bot relied
 * on an always-on presence loop to create profiles; the webhook is now the
 * first contact point). Level-ups mirror XpService: season XP rolls over,
 * +1 skill point per level; `xp` stays a lifetime total for leaderboards.
 */
async function addXp(supabase: SupabaseClient, streamerId: string, ev: ChatEvent, amount: number): Promise<void> {
  const bot = botSchema(supabase);
  const { data: profile } = await bot
    .from('viewer_profiles')
    .select('id, xp, season_xp, level, points, skill_points')
    .eq('streamer_id', streamerId)
    .eq('twitch_user_id', ev.chatterTwitchId)
    .maybeSingle();

  if (!profile) {
    await bot.from('viewer_profiles').insert({
      streamer_id: streamerId,
      twitch_user_id: ev.chatterTwitchId,
      username: ev.chatterName,
      xp: amount,
      season_xp: amount,
      points: amount,
      level: 1,
    });
    return;
  }

  let seasonXp = (profile.season_xp ?? 0) + amount;
  let level = profile.level ?? 1;
  let skillPointsToAdd = 0;
  while (seasonXp >= xpForNextLevel(level)) {
    seasonXp -= xpForNextLevel(level);
    level++;
    skillPointsToAdd++;
  }

  await bot
    .from('viewer_profiles')
    .update({
      xp: (profile.xp ?? 0) + amount,
      season_xp: seasonXp,
      level,
      points: (profile.points ?? 0) + amount,
      skill_points: (profile.skill_points ?? 0) + skillPointsToAdd,
      username: ev.chatterName,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', profile.id);
}

// ── Overlays ──────────────────────────────────────────────────────────────────

/** Feed chat widgets: broadcast the message to each of the streamer's overlays. */
async function emitToOverlays(env: Env, supabase: SupabaseClient, streamerId: string, ev: ChatEvent): Promise<void> {
  const bot = botSchema(supabase);
  // Overlays + this channel's custom emote set fetched together — both are only
  // needed when the channel actually has overlays to feed.
  const [{ data: overlays }, { data: own }, { data: links }] = await Promise.all([
    bot.from('overlays').select('id').eq('streamer_id', streamerId),
    bot.from('emotes').select('id, code, image_url, width, animated, zero_width').eq('owner_id', streamerId),
    bot.from('channel_emotes').select('emotes(id, code, image_url, width, animated, zero_width, visibility, status)').eq('streamer_id', streamerId),
  ]);
  if (!overlays?.length) return;

  // Custom emote codes typed in the message → image URLs, appended to Twitch's
  // native emotes so the emote-wall rains both. Own codes win collisions.
  const added = (links ?? [])
    .map((r: any) => r.emotes)
    .filter((e: any) => e && e.visibility === 'public' && e.status === 'approved') as EmoteRow[];
  const emoteMap = buildEmoteMap((own ?? []) as EmoteRow[], added);
  const customUrls = emoteUrlsInText(ev.text, emoteMap);

  const payload = {
    username: ev.chatterName,
    message: ev.text,
    badges: [...ev.badges],
    emotes: [...(ev.emotes ?? []), ...customUrls],
  };
  await Promise.allSettled(overlays.map((o: any) => broadcast(env, `overlay:${o.id}`, 'chat', payload)));
}

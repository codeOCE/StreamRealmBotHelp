import { describe, it, expect } from 'vitest';
import { parseVariables, normalizeSyntax, type ParseContext } from '../src/chat/variables';
import { evaluateRules, type ModRule } from '../src/chat/moderation';
import {
  userLevelFromEvent,
  hasPermission,
  parseBang,
  matchCommand,
  matchRegexCommands,
  offGlobalCooldown,
  offUserCooldown,
  pickCommandResponses,
  type ChatEvent,
  type CommandRow,
} from '../src/chat/logic';

const ctx = (over: Partial<ParseContext> = {}): ParseContext => ({
  user: 'Alice',
  userId: '111',
  channel: 'castle',
  broadcasterId: '999',
  count: 5,
  args: [],
  ...over,
});

const ev = (over: Partial<ChatEvent> = {}): ChatEvent => ({
  broadcasterTwitchId: '999',
  broadcasterLogin: 'castle',
  chatterTwitchId: '111',
  chatterLogin: 'alice',
  chatterName: 'Alice',
  messageId: 'm1',
  text: 'hello',
  badges: new Set<string>(),
  ...over,
});

const cmd = (over: Partial<CommandRow> = {}): CommandRow => ({
  id: 'c1',
  trigger: 'hello',
  enabled: true,
  cooldown: 0,
  user_cooldown: 0,
  user_level: 'VIEWER',
  responses: ['hi'],
  response_type: 'SAY',
  response_mode: 'ALL',
  aliases: [],
  usages: 0,
  is_built_in: false,
  is_regex: false,
  last_used_at: null,
  ...over,
});

describe('variables', () => {
  it('normalizes StreamElements ${} syntax and aliases', () => {
    expect(normalizeSyntax('Hey ${user.name} in ${channel.name}')).toBe('Hey $(user) in $(channel)');
  });

  it('substitutes core context variables', async () => {
    const out = await parseVariables('$(user) in $(channel), used $(count) times', ctx());
    expect(out).toBe('Alice in castle, used 5 times');
  });

  it('handles touser with and without args', async () => {
    expect(await parseVariables('$(touser)', ctx({ args: ['@Bob'] }))).toBe('Bob');
    expect(await parseVariables('$(touser)', ctx())).toBe('Alice');
  });

  it('handles positional and range args', async () => {
    const c = ctx({ args: ['one', 'two', 'three'] });
    expect(await parseVariables('$(2)', c)).toBe('two');
    expect(await parseVariables('$(2:)', c)).toBe('two three');
    expect(await parseVariables('$(1)', ctx())).toBe('Alice'); // default to user
  });

  it('handles legacy curly braces', async () => {
    expect(await parseVariables('Hi {user}, count {count}', ctx())).toBe('Hi Alice, count 5');
  });

  it('produces an in-range random number', async () => {
    const out = Number(await parseVariables('$(random.1-10)', ctx()));
    expect(out).toBeGreaterThanOrEqual(1);
    expect(out).toBeLessThanOrEqual(10);
  });

  it('refuses eval', async () => {
    expect(await parseVariables('$(eval 1+1)', ctx())).toBe('[eval is not supported]');
  });

  it('marks unknown tags without infinite looping', async () => {
    expect(await parseVariables('$(bogus)', ctx())).toContain('unknown:bogus');
  });

  it('urlfetch caps output, requires http(s), and neuters $( injection', async () => {
    const out = await parseVariables('api says: $(urlfetch https://x.example/y)', ctx(), {
      fetchUrl: async () => 'hello\nworld $(user) end',
    });
    expect(out).toBe('api says: hello world $ (user) end');
    expect(await parseVariables('$(urlfetch ftp://x)', ctx(), {})).toBe('[urlfetch needs an http(s) URL]');
    expect(await parseVariables('$(urlfetch https://x)', ctx(), { fetchUrl: async () => null })).toBe('[urlfetch error]');
  });

  it('uses injected resolvers for game/uptime', async () => {
    const out = await parseVariables('Playing $(game), live $(uptime)', ctx(), {
      getChannelInfo: async () => ({ game_name: 'Tetris', title: 't' }),
      getStreamInfo: async () => ({ started_at: new Date(Date.now() - 90 * 60_000).toISOString() }),
    });
    expect(out).toBe('Playing Tetris, live 1h 30m');
  });
});

describe('moderation rules', () => {
  const rule = (type: string, settings: ModRule['settings'] = {}): ModRule => ({
    id: 'r1',
    type,
    enabled: true,
    settings,
  });

  it('flags links and respects bypass level', () => {
    const rules = [rule('LINKS', { bypassLevel: 'SUBSCRIBER' })];
    expect(evaluateRules(rules, 'go to https://evil.example', 'VIEWER')?.rule.type).toBe('LINKS');
    expect(evaluateRules(rules, 'go to https://evil.example', 'SUBSCRIBER')).toBeNull();
  });

  it('flags excessive caps over threshold only', () => {
    const rules = [rule('CAPS', { threshold: 0.7, minLength: 5 })];
    expect(evaluateRules(rules, 'STOP YELLING AT ME', 'VIEWER')).not.toBeNull();
    expect(evaluateRules(rules, 'normal message', 'VIEWER')).toBeNull();
    expect(evaluateRules(rules, 'HI', 'VIEWER')).toBeNull(); // under minLength
  });

  it('flags banned words case-insensitively', () => {
    const rules = [rule('BANNED_WORDS', { words: ['Badword'] })];
    expect(evaluateRules(rules, 'what a BADWORD here', 'VIEWER')).not.toBeNull();
  });

  it('defaults action to TIMEOUT 600', () => {
    const v = evaluateRules([rule('LINKS')], 'https://x.example', 'VIEWER');
    expect(v?.action).toBe('TIMEOUT');
    expect(v?.duration).toBe(600);
  });

  it('allowlisted domains (and subdomains) never trip the link filter', () => {
    const rules = [rule('LINKS', { allowedDomains: ['youtube.com', 'twitch.tv'] })];
    expect(evaluateRules(rules, 'https://www.youtube.com/watch?v=x', 'VIEWER')).toBeNull();
    expect(evaluateRules(rules, 'https://clips.twitch.tv/abc', 'VIEWER')).toBeNull();
    expect(evaluateRules(rules, 'https://nottwitch.tv/abc', 'VIEWER')).not.toBeNull();
    expect(evaluateRules(rules, 'https://evil.example plus https://twitch.tv/ok', 'VIEWER')).not.toBeNull();
  });

  it('supports wildcard and regex banned-word entries', () => {
    const rules = [rule('BANNED_WORDS', { words: ['spam*', '/b[a4]d/'] })];
    expect(evaluateRules(rules, 'buy spammy stuff', 'VIEWER')).not.toBeNull();
    expect(evaluateRules(rules, 'that was b4d', 'VIEWER')).not.toBeNull();
    expect(evaluateRules(rules, 'clean message', 'VIEWER')).toBeNull();
    // invalid regex entry is ignored, not a match-everything
    expect(evaluateRules([rule('BANNED_WORDS', { words: ['/[/'] })], 'hello', 'VIEWER')).toBeNull();
  });

  it('percentage thresholds from seeded defaults work (CAPS 70 = 70%)', () => {
    const rules = [rule('CAPS', { threshold: 70 })];
    expect(evaluateRules(rules, 'STOP YELLING AT ME', 'VIEWER')).not.toBeNull();
    expect(evaluateRules(rules, 'normal message', 'VIEWER')).toBeNull();
  });

  it('spam threshold > 1 means max word repeats', () => {
    const rules = [rule('SPAM', { threshold: 4 })];
    expect(evaluateRules(rules, 'gg gg gg gg gg', 'VIEWER')).not.toBeNull();
    expect(evaluateRules(rules, 'gg gg well played', 'VIEWER')).toBeNull();
  });

  it('emote rule uses real fragment count when provided', () => {
    const rules = [rule('EMOTES', { threshold: 10 })];
    expect(evaluateRules(rules, 'Kappa '.repeat(11).trim(), 'VIEWER', 11)).not.toBeNull();
    expect(evaluateRules(rules, 'Kappa Kappa nice', 'VIEWER', 2)).toBeNull();
  });
});

describe('command matching', () => {
  it('derives user level from badges', () => {
    expect(userLevelFromEvent(ev())).toBe('VIEWER');
    expect(userLevelFromEvent(ev({ badges: new Set(['moderator']) }))).toBe('MODERATOR');
    expect(userLevelFromEvent(ev({ badges: new Set(['founder']) }))).toBe('SUBSCRIBER');
    expect(userLevelFromEvent(ev({ chatterTwitchId: '999' }))).toBe('BROADCASTER');
  });

  it('enforces the permission ladder', () => {
    expect(hasPermission('VIEWER', 'MODERATOR')).toBe(false);
    expect(hasPermission('BROADCASTER', 'MODERATOR')).toBe(true);
    expect(hasPermission('VIP', 'SUBSCRIBER')).toBe(true);
    expect(hasPermission('VIEWER', 'VIEWER')).toBe(true);
  });

  it('parses bang commands', () => {
    expect(parseBang('!hello world  again')).toEqual({ trigger: 'hello', args: ['world', 'again'] });
    expect(parseBang('hello')).toBeNull();
    expect(parseBang('!')).toBeNull();
  });

  it('matches by trigger or alias, case-insensitively', () => {
    const commands = [cmd({ trigger: 'Discord', aliases: ['dc'] })];
    expect(matchCommand(commands, 'discord')?.id).toBe('c1');
    expect(matchCommand(commands, 'dc')?.id).toBe('c1');
    expect(matchCommand(commands, 'nope')).toBeNull();
  });

  it('matches regex commands with capture groups as args', () => {
    const commands = [cmd({ trigger: 'good (morning|night)', is_regex: true })];
    const matches = matchRegexCommands(commands, 'good MORNING everyone');
    expect(matches).toHaveLength(1);
    expect(matches[0].args).toEqual(['MORNING']);
  });

  it('skips invalid regex patterns without throwing', () => {
    const commands = [cmd({ trigger: '([broken', is_regex: true })];
    expect(matchRegexCommands(commands, 'anything')).toEqual([]);
  });

  it('computes cooldowns', () => {
    const now = Date.now();
    expect(offGlobalCooldown(10, new Date(now - 5_000).toISOString(), now)).toBe(false);
    expect(offGlobalCooldown(10, new Date(now - 15_000).toISOString(), now)).toBe(true);
    expect(offGlobalCooldown(0, new Date(now).toISOString(), now)).toBe(true);
    expect(offUserCooldown(30, null, now)).toBe(true);
    expect(offUserCooldown(30, new Date(now - 10_000).toISOString(), now)).toBe(false);
  });

  it('picks all responses when mode is ALL', () => {
    expect(pickCommandResponses(['a', 'b', 'c'], 'ALL')).toEqual(['a', 'b', 'c']);
  });

  it('picks one response when mode is RANDOM', () => {
    const picked = pickCommandResponses(['a', 'b', 'c'], 'RANDOM');
    expect(picked).toHaveLength(1);
    expect(['a', 'b', 'c']).toContain(picked[0]);
  });
});

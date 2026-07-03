import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema, getPublicOwner } from '../lib/supabase';
import { getUserFromSession } from '../lib/session';
import { error, json } from '../lib/response';

/**
 * Loyalty / XP / skills — ported from the NestJS LoyaltyController + Skills/Xp
 * services (apps/api/src/bot/{loyalty.controller,skills.service,xp.service}.ts).
 * Scoped to the authenticated streamer; viewer data lives in bot.viewer_profiles
 * (populated by the bot runtime — sparse until that is wired). Loyalty config is
 * stored under bot.tenants.settings.loyalty.
 *
 * Routes (under /api/loyalty):
 *   GET   /leaderboard            viewer_profiles by points desc (dashboard, session-gated)
 *   GET   /public/:streamerId     same ranking, no auth — powers the shareable /leaderboard/:id page
 *   GET   /settings              loyalty config
 *   PATCH /settings              update loyalty config
 *   GET   /dashboard/:twitchId   { tenantId, profile, skillTree }
 *   POST  /skills/unlock         unlock a skill node for a viewer
 *   POST  /xp/test-add           dev helper: add XP to a viewer
 */

const DEFAULT_SETTINGS = { enabled: true, pointsPerInterval: 10, intervalMinutes: 5, subMultiplier: 2, currencyName: 'Points' };

// XP curve: floor(level * 100 * 1.2^level) — mirrors XpService.
const xpForNextLevel = (level: number) => Math.floor(level * 100 * Math.pow(1.2, level));

function profileToApi(p: Record<string, any>, unlocked: { skill_node_id: string }[]) {
  return {
    id: p.id,
    username: p.username,
    level: p.level,
    points: p.points,
    seasonXp: p.season_xp,
    skillPoints: p.skill_points,
    unlockedSkills: unlocked.map((u) => ({ skillNodeId: u.skill_node_id })),
  };
}

export async function handleLoyalty(
  request: Request,
  env: Env,
  supabase: SupabaseClient,
  path: string,
  method: string,
): Promise<Response> {
  const seg = path.slice('/api/loyalty'.length).replace(/^\//, '').split('/').filter(Boolean);

  // GET /public/:streamerId — no auth. Powers the shareable leaderboard page:
  // same points ranking as the dashboard, plus the streamer's own branding and
  // the earn-rate blurb (from real loyalty settings, not a fake description).
  if (method === 'GET' && seg[0] === 'public') {
    const sid = seg[1];
    if (!sid) return error('Not found', 404, request, env);
    const bot = botSchema(supabase);
    const [{ data }, owner, { data: tenant }] = await Promise.all([
      bot
        .from('viewer_profiles')
        .select('username, level, points, xp')
        .eq('streamer_id', sid)
        .order('points', { ascending: false })
        .limit(100),
      getPublicOwner(supabase, sid),
      bot.from('tenants').select('settings').eq('streamer_id', sid).maybeSingle(),
    ]);
    const loyalty = { ...DEFAULT_SETTINGS, ...((tenant?.settings ?? {}) as Record<string, any>).loyalty };
    const viewers = (data ?? []).map((v: any) => ({
      username: v.username, level: v.level, points: v.points, xp: v.xp,
    }));
    return json(
      {
        owner,
        loyalty: {
          currencyName: loyalty.currencyName,
          pointsPerInterval: loyalty.pointsPerInterval,
          intervalMinutes: loyalty.intervalMinutes,
          subMultiplier: loyalty.subMultiplier,
        },
        viewers,
      },
      request,
      env,
    );
  }

  const user = await getUserFromSession(request, env, supabase);
  if (!user) return error('Not authenticated', 401, request, env);
  const streamerId = user.id;
  const bot = botSchema(supabase);

  // GET /leaderboard
  if (method === 'GET' && seg[0] === 'leaderboard') {
    const { data, error: e } = await bot
      .from('viewer_profiles')
      .select('id, username, level, xp, points, last_active_at')
      .eq('streamer_id', streamerId)
      .order('points', { ascending: false })
      .limit(100);
    if (e) return error(e.message, 500, request, env);
    return json(
      (data ?? []).map((v: any) => ({
        id: v.id, username: v.username, level: v.level, xp: v.xp, points: v.points, lastActiveAt: v.last_active_at,
      })),
      request,
      env,
    );
  }

  // GET/PATCH /settings  (stored under bot.tenants.settings.loyalty)
  if (seg[0] === 'settings') {
    const { data: tenant } = await bot.from('tenants').select('settings').eq('streamer_id', streamerId).maybeSingle();
    const settings = (tenant?.settings ?? {}) as Record<string, any>;

    if (method === 'GET') {
      return json({ ...DEFAULT_SETTINGS, ...(settings.loyalty ?? {}) }, request, env);
    }
    if (method === 'PATCH') {
      const body = (await request.json()) as Record<string, any>;
      const merged = { ...settings, loyalty: { ...DEFAULT_SETTINGS, ...(settings.loyalty ?? {}), ...body } };
      const { error: e } = await bot
        .from('tenants')
        .update({ settings: merged, updated_at: new Date().toISOString() })
        .eq('streamer_id', streamerId);
      if (e) return error(e.message, 400, request, env);
      return json(merged.loyalty, request, env);
    }
  }

  // GET /dashboard/:twitchUserId  (omit id to use the authenticated streamer)
  if (method === 'GET' && seg[0] === 'dashboard') {
    try {
      const twitchUserId = seg[1] || user.twitch_id;
      if (!twitchUserId) return error('Twitch user id required', 400, request, env);

      let { data: profile } = await bot
        .from('viewer_profiles')
        .select('*')
        .eq('streamer_id', streamerId)
        .eq('twitch_user_id', twitchUserId)
        .maybeSingle();

      if (!profile) {
        const { data: created, error: insErr } = await bot
          .from('viewer_profiles')
          .insert({
            streamer_id: streamerId,
            twitch_user_id: twitchUserId,
            username: user.username,
            points: 100,
            skill_points: 5,
          })
          .select('*')
          .single();

        if (insErr?.code === '23505') {
          const { data: existing } = await bot
            .from('viewer_profiles')
            .select('*')
            .eq('streamer_id', streamerId)
            .eq('twitch_user_id', twitchUserId)
            .maybeSingle();
          profile = existing;
        } else {
          profile = created;
        }
      }

      if (!profile) return error('Could not load viewer profile', 500, request, env);

      const { data: unlocked } = await bot
        .from('user_skills')
        .select('skill_node_id')
        .eq('viewer_profile_id', profile.id);
      const { data: nodes } = await bot.from('skill_nodes').select('*').eq('streamer_id', streamerId);

      const skillTree = (nodes ?? []).map((n) => ({
        id: n.id,
        name: n.name,
        description: n.description,
        effectType: n.effect_type,
        effectValue: n.effect_value,
        cost: n.cost,
        parentId: n.parent_id,
      }));

      return json(
        { tenantId: streamerId, profile: profileToApi(profile, unlocked ?? []), skillTree },
        request,
        env,
      );
    } catch (e) {
      console.error('[Loyalty] dashboard failed:', e);
      return error('Could not load loyalty dashboard', 500, request, env);
    }
  }

  // POST /skills/unlock  { twitchUserId, skillNodeId }
  if (method === 'POST' && seg[0] === 'skills' && seg[1] === 'unlock') {
    const body = (await request.json()) as { twitchUserId?: string; skillNodeId?: string };
    if (!body.twitchUserId || !body.skillNodeId) return error('twitchUserId and skillNodeId required', 400, request, env);

    const { data: profile } = await bot
      .from('viewer_profiles')
      .select('*')
      .eq('streamer_id', streamerId)
      .eq('twitch_user_id', body.twitchUserId)
      .maybeSingle();
    if (!profile) return error('Viewer profile not found', 400, request, env);

    const { data: skill } = await bot
      .from('skill_nodes')
      .select('*')
      .eq('id', body.skillNodeId)
      .eq('streamer_id', streamerId)
      .maybeSingle();
    if (!skill) return error('Skill node not found', 400, request, env);

    const { data: unlocked } = await bot.from('user_skills').select('skill_node_id').eq('viewer_profile_id', profile.id);
    const unlockedIds = new Set((unlocked ?? []).map((u: any) => u.skill_node_id));
    if (unlockedIds.has(skill.id)) return error('Skill already unlocked', 400, request, env);
    if (profile.skill_points < skill.cost) return error(`Insufficient skill points. Need ${skill.cost}`, 400, request, env);
    if (skill.parent_id && !unlockedIds.has(skill.parent_id)) return error('Parent skill must be unlocked first', 400, request, env);

    await bot.from('user_skills').insert({ viewer_profile_id: profile.id, skill_node_id: skill.id });
    await bot.from('viewer_profiles').update({ skill_points: profile.skill_points - skill.cost }).eq('id', profile.id);
    return json({ success: true, skillName: skill.name, remainingPoints: profile.skill_points - skill.cost }, request, env);
  }

  // POST /xp/test-add  { twitchUserId, amount }  (dev helper)
  if (method === 'POST' && seg[0] === 'xp' && seg[1] === 'test-add') {
    const body = (await request.json()) as { twitchUserId?: string; amount?: number };
    const amount = Number(body.amount) || 0;
    const { data: profile } = await bot
      .from('viewer_profiles')
      .select('*')
      .eq('streamer_id', streamerId)
      .eq('twitch_user_id', body.twitchUserId ?? '')
      .maybeSingle();
    if (!profile) return error('Viewer profile not found', 404, request, env);

    let newXp = profile.season_xp + amount;
    let level = profile.level;
    let skillPointsAdd = 0;
    while (newXp >= xpForNextLevel(level)) {
      newXp -= xpForNextLevel(level);
      level++;
      skillPointsAdd++;
    }
    const { data: updated } = await bot
      .from('viewer_profiles')
      .update({
        season_xp: newXp,
        level,
        points: profile.points + amount,
        skill_points: profile.skill_points + skillPointsAdd,
        last_active_at: new Date().toISOString(),
      })
      .eq('id', profile.id)
      .select('*')
      .single();
    return json(
      { leveledUp: skillPointsAdd > 0, currentLevel: level, currentXp: newXp, nextLevelXp: xpForNextLevel(level), skillPoints: updated?.skill_points },
      request,
      env,
    );
  }

  return error('Not found', 404, request, env);
}

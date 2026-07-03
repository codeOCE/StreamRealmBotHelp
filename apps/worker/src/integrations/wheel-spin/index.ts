import type { SupabaseClient } from '@supabase/supabase-js';
import type { Integration, IntegrationContext, PublicIntegrationContext } from '../types';
import { botSchema } from '../../lib/supabase';
import { json, error } from '../../lib/response';
import { broadcast } from '../../realtime';
import { uploadPublic, safeExt } from '../../lib/storage';
import { sendChatMessage } from '../../lib/creator-chat';
import { getCreatorCreds } from '../../token-do';
import {
  pickWeighted,
  sanitizeSegments,
  sanitizeConfig,
  DEFAULT_WHEEL_CONFIG,
  type WheelSegment,
  type WheelConfig,
} from './logic';

/**
 * Wheel Spin — a creator configures a fully customizable wheel of segments and
 * spins it from the dashboard. The Worker picks a weighted-random segment (the
 * weight drives both odds AND slice size), records the spin, optionally removes
 * the winning wedge + announces it in chat, and broadcasts on `wheel:<wheelId>`
 * so the OBS overlay animates to the result. See migrations/004_wheel.sql +
 * 011_wheel_v2.sql.
 *
 * Owner routes (auth, under /api/integrations/wheel-spin):
 *   GET    /wheels             list the streamer's wheels
 *   POST   /wheels             create { title?, segments, config? }  (max 5)
 *   GET    /wheels/:id         wheel + recent spins
 *   PATCH  /wheels/:id         update { title?, segments?, config? }
 *   DELETE /wheels/:id
 *   POST   /wheels/:id/spin    spin -> { index, label, removed }  (broadcasts)
 *   POST   /wheels/:id/reset   restore wedges removed by remove-on-select
 *   POST   /upload             store an image/audio asset -> { url }
 *
 * Public route (no auth, under /api/integrations/wheel-spin/public):
 *   GET    /wheels/:id         wheel config for the overlay { title, segments[], config }
 */

const MAX_WHEELS = 5;

type WheelRow = {
  id: string;
  streamer_id: string;
  title: string;
  segments: WheelSegment[];
  /** Creator-authored snapshot; `segments` shrinks on remove-on-select spins. */
  base_segments: WheelSegment[] | null;
  config: Partial<WheelConfig> | null;
  created_at: string;
  updated_at: string;
};

function mapWheel(w: WheelRow) {
  return {
    id: w.id,
    title: w.title,
    segments: w.segments ?? [],
    baseSegments: w.base_segments ?? w.segments ?? [],
    config: sanitizeConfig(w.config),
    createdAt: w.created_at,
  };
}

async function getOwnedWheel(
  supabase: SupabaseClient,
  streamerId: string,
  id: string,
): Promise<WheelRow | null> {
  const { data } = await botSchema(supabase)
    .from('wheels')
    .select('*')
    .eq('id', id)
    .eq('streamer_id', streamerId)
    .maybeSingle();
  return (data as WheelRow) ?? null;
}

// ============================================================================
// Owner (authenticated) routes
// ============================================================================
async function handleOwner(ctx: IntegrationContext): Promise<Response | null> {
  const { request, env, supabase, streamerId, segments, method } = ctx;
  const bot = botSchema(supabase);

  // ---- /upload — store an image or audio asset, return its public URL ----
  if (segments[0] === 'upload' && method === 'POST') {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file') as unknown;
    if (!(file instanceof File)) return error('file required', 400, request, env);
    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');
    if (!isImage && !isAudio) return error('must be an image or audio file', 400, request, env);
    const limit = isAudio ? 2 * 1024 * 1024 : 3 * 1024 * 1024;
    if (file.size > limit) return error(`file must be under ${limit / (1024 * 1024)}MB`, 400, request, env);
    const kind = isAudio ? 'audio' : 'images';
    const path = `wheel/${kind}/${streamerId}/${crypto.randomUUID()}.${safeExt(file.name, isAudio ? 'mp3' : 'png')}`;
    const url = await uploadPublic(supabase, path, file, file.type);
    if (!url) return error('Upload failed', 500, request, env);
    return json({ url }, request, env, { status: 201 });
  }

  if (segments[0] !== 'wheels') return null;
  const id = segments[1];
  const action = segments[2];

  // ---- /wheels ----
  if (!id) {
    if (method === 'GET') {
      const { data } = await bot
        .from('wheels')
        .select('*')
        .eq('streamer_id', streamerId)
        .order('created_at', { ascending: false });
      return json({ wheels: (data ?? []).map((w) => mapWheel(w as WheelRow)) }, request, env);
    }
    if (method === 'POST') {
      if (!ctx.enabled) return error('Wheel Spin is not enabled', 403, request, env);
      const { count } = await bot
        .from('wheels')
        .select('id', { count: 'exact', head: true })
        .eq('streamer_id', streamerId);
      if ((count ?? 0) >= MAX_WHEELS) {
        return error(`You can save up to ${MAX_WHEELS} wheels — delete one first`, 400, request, env);
      }
      const body = (await request.json().catch(() => ({}))) as any;
      const segs = sanitizeSegments(body.segments);
      const { data, error: dbErr } = await bot
        .from('wheels')
        .insert({
          streamer_id: streamerId,
          title: String(body.title ?? 'Wheel').slice(0, 80),
          segments: segs,
          base_segments: segs,
          config: sanitizeConfig(body.config),
        })
        .select('*')
        .single();
      if (dbErr) return error(dbErr.message, 500, request, env);
      return json({ wheel: mapWheel(data as WheelRow) }, request, env, { status: 201 });
    }
    return error('Method not allowed', 405, request, env);
  }

  // ---- /wheels/:id ----
  const wheel = await getOwnedWheel(supabase, streamerId, id);
  if (!wheel) return error('Wheel not found', 404, request, env);

  if (!action) {
    if (method === 'GET') {
      const { data: spins } = await bot
        .from('wheel_spins')
        .select('id, result, segment_index, created_at')
        .eq('wheel_id', id)
        .order('created_at', { ascending: false })
        .limit(10);
      return json({ wheel: mapWheel(wheel), spins: spins ?? [] }, request, env);
    }
    if (method === 'PATCH') {
      const body = (await request.json().catch(() => ({}))) as any;
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (body.title !== undefined) patch.title = String(body.title).slice(0, 80);
      if (body.segments !== undefined) {
        patch.segments = sanitizeSegments(body.segments);
        // Saving segments re-baselines the restore snapshot.
        patch.base_segments = patch.segments;
      }
      if (body.config !== undefined) {
        // Merge incoming config over the stored config so partial PATCHes work.
        patch.config = sanitizeConfig({ ...(wheel.config ?? {}), ...body.config });
      }
      const { data, error: dbErr } = await bot
        .from('wheels')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (dbErr) return error(dbErr.message, 500, request, env);
      return json({ wheel: mapWheel(data as WheelRow) }, request, env);
    }
    if (method === 'DELETE') {
      await bot.from('wheels').delete().eq('id', id);
      return json({ success: true }, request, env);
    }
    return error('Method not allowed', 405, request, env);
  }

  // ---- /wheels/:id/reset — restore wedges removed by remove-on-select ----
  if (action === 'reset' && method === 'POST') {
    const { data, error: dbErr } = await bot
      .from('wheels')
      .update({ segments: wheel.base_segments ?? wheel.segments ?? [], updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (dbErr) return error(dbErr.message, 500, request, env);
    return json({ wheel: mapWheel(data as WheelRow) }, request, env);
  }

  // ---- /wheels/:id/spin ----
  if (action === 'spin' && method === 'POST') {
    const segs = wheel.segments ?? [];
    if (segs.length < 2) return error('Add at least 2 segments before spinning', 400, request, env);
    const config = sanitizeConfig(wheel.config);
    const index = pickWeighted(segs);
    const result = segs[index].label;

    const { data: spin } = await bot
      .from('wheel_spins')
      .insert({ wheel_id: id, streamer_id: streamerId, result, segment_index: index })
      .select('id, created_at')
      .single();

    // Remove-on-select: drop the winning wedge and persist the smaller wheel.
    const removed = config.removeOnSelect && segs.length > 1;
    if (removed) {
      const next = segs.filter((_, i) => i !== index);
      await bot.from('wheels').update({ segments: next, updated_at: new Date().toISOString() }).eq('id', id);
    }

    await broadcast(env, `wheel:${id}`, 'wheel.spin', {
      index,
      label: result,
      removeIndex: removed ? index : null,
      spinId: spin?.id,
      at: spin?.created_at,
    });

    // Announce in Twitch chat as the creator (best-effort; needs user:write:chat).
    if (config.announce.chat) {
      const creds = await getCreatorCreds(env, streamerId);
      if (creds) await sendChatMessage(env, creds, `🎡 The wheel landed on: ${result}!`);
    }

    return json({ index, label: result, removed, spinId: spin?.id }, request, env);
  }

  return null;
}

// ============================================================================
// Public (overlay) route — wheel config, scoped by the unguessable wheel UUID
// ============================================================================
async function handlePublic(ctx: PublicIntegrationContext): Promise<Response | null> {
  const { request, env, supabase, segments, method } = ctx;
  const [resource, id] = segments;

  if (resource === 'wheels' && id && method === 'GET') {
    const { data } = await botSchema(supabase)
      .from('wheels')
      .select('id, title, segments, config')
      .eq('id', id)
      .maybeSingle();
    if (!data) return error('Wheel not found', 404, request, env);
    const w = data as any;
    // The wheel's whole point is proportional slices, so weight is sent (it sizes
    // the wedges). Labels, colors, images + weight only — no internal fields.
    const publicSegments = (w.segments ?? []).map((s: WheelSegment) => ({
      label: s.label,
      color: s.color,
      image: s.image,
      weight: s.weight,
    }));
    return json(
      { wheel: { id: w.id, title: w.title, segments: publicSegments, config: sanitizeConfig(w.config) } },
      request,
      env,
    );
  }

  return null;
}

const wheelSpin: Integration = {
  manifest: {
    id: 'wheel-spin',
    name: 'Wheel Spin',
    description: 'Spin a fully customizable prize wheel live on stream.',
    icon: 'Disc3',
    category: 'game',
    dashboardPath: '/dashboard/wheel',
    defaultConfig: {},
  },
  handle: handleOwner,
  handlePublic,
};

export default wheelSpin;

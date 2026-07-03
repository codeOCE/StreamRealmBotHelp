import type { Integration } from '../types';
import { botSchema } from '../../lib/supabase';
import { json, error } from '../../lib/response';

/**
 * Rank — maps a viewer's loyalty points to a configurable tier ("Bronze",
 * "Diamond", …). Reads from the existing loyalty data the bot accrues
 * (bot.loyalty), so this is read-only over data another system owns.
 *
 * Module routes (under /api/integrations/rank):
 *   GET  /lookup?user=<twitchId|username>  -> { points, tier }
 */

interface Tier {
  name: string;
  /** Minimum points to reach this tier. */
  min: number;
}

const rank: Integration = {
  manifest: {
    id: 'rank',
    name: 'Rank',
    description: 'Give viewers a tier badge based on their loyalty points.',
    icon: 'Trophy',
    category: 'engagement',
    defaultConfig: {
      tiers: [
        { name: 'Bronze', min: 0 },
        { name: 'Silver', min: 1000 },
        { name: 'Gold', min: 5000 },
        { name: 'Diamond', min: 25000 },
      ] as Tier[],
    },
  },

  async handle(ctx) {
    const [action] = ctx.segments;

    if (action === 'lookup' && ctx.method === 'GET') {
      if (!ctx.enabled) return error('Rank is not enabled', 403, ctx.request, ctx.env);
      const url = new URL(ctx.request.url);
      const userKey = url.searchParams.get('user');
      if (!userKey) return error('user query param required', 400, ctx.request, ctx.env);

      // Look up loyalty by twitch id first, then username.
      const bot = botSchema(ctx.supabase);
      let { data: row } = await bot
        .from('loyalty')
        .select('points')
        .eq('streamer_id', ctx.streamerId)
        .eq('twitch_id', userKey)
        .maybeSingle();
      if (!row) {
        ({ data: row } = await bot
          .from('loyalty')
          .select('points')
          .eq('streamer_id', ctx.streamerId)
          .eq('username', userKey)
          .maybeSingle());
      }

      const points = Number(row?.points ?? 0);
      const tiers = [...((ctx.config.tiers ?? []) as Tier[])].sort((a, b) => a.min - b.min);
      let tier = tiers[0]?.name ?? 'Unranked';
      for (const t of tiers) if (points >= t.min) tier = t.name;

      return json({ user: userKey, points, tier }, ctx.request, ctx.env);
    }

    return null;
  },
};

export default rank;

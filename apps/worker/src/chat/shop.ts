import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { broadcast } from '../realtime';

/**
 * The Royal Shop — viewer chat commands for the loyalty store.
 *
 *   !shop / !rewards / !store   list available rewards (code — name — cost)
 *   !buy <code> / !redeem <code>  spend Points on a reward (atomic redeem RPC)
 *
 * Handled directly in the chat pipeline (before custom-command lookup) so it
 * needs no seeded command rows. Redemptions broadcast on `shop:<streamerId>` so
 * the dashboard queue updates live.
 */

export const SHOP_LIST_TRIGGERS = new Set(['shop', 'rewards', 'store']);
export const SHOP_BUY_TRIGGERS = new Set(['buy', 'redeem']);
export const SHOP_TRIGGERS = new Set([...SHOP_LIST_TRIGGERS, ...SHOP_BUY_TRIGGERS]);

interface ShopCtx {
  env: Env;
  supabase: SupabaseClient;
  streamerId: string;
  viewerTwitchId: string;
  viewerName: string;
  trigger: string;
  args: string[];
  say: (msg: string) => Promise<unknown>;
}

const REASONS: Record<string, string> = {
  'no such item': "that reward doesn't exist — check !shop",
  'item unavailable': 'that reward is currently unavailable',
  'out of stock': 'that reward is out of stock',
  'no points yet': "you don't have any Points yet — hang out in chat to earn some",
  'not enough points': "you don't have enough Points for that",
  'limit reached': "you've already claimed that reward as many times as allowed",
};

/** Returns true when the message was a shop command (so the pipeline stops). */
export async function handleShopCommand(ctx: ShopCtx): Promise<boolean> {
  const bot = botSchema(ctx.supabase);

  if (SHOP_LIST_TRIGGERS.has(ctx.trigger)) {
    const { data: items } = await bot
      .from('shop_items')
      .select('code, name, cost, stock')
      .eq('streamer_id', ctx.streamerId)
      .eq('enabled', true)
      .order('sort', { ascending: true })
      .limit(25);
    if (!items?.length) {
      await ctx.say('The Royal Shop is empty right now — check back soon!');
      return true;
    }
    const list = items
      .filter((i: any) => i.stock === null || i.stock > 0)
      .map((i: any) => `${i.code} — ${i.name} (${i.cost} pts)`)
      .join(' | ');
    await ctx.say(`🏰 Royal Shop: ${list}`.slice(0, 480));
    return true;
  }

  if (SHOP_BUY_TRIGGERS.has(ctx.trigger)) {
    const code = (ctx.args[0] ?? '').toLowerCase().replace(/^!/, '');
    if (!code) {
      await ctx.say(`@${ctx.viewerName}, usage: !buy <code> — see !shop for codes.`);
      return true;
    }
    const { data: item } = await bot
      .from('shop_items')
      .select('id')
      .eq('streamer_id', ctx.streamerId)
      .eq('code', code)
      .maybeSingle();
    if (!item) {
      await ctx.say(`@${ctx.viewerName}, no reward with code "${code}". Try !shop.`);
      return true;
    }

    const { data, error } = await bot.rpc('redeem_shop_item', {
      p_streamer_id: ctx.streamerId,
      p_item_id: item.id,
      p_viewer: ctx.viewerTwitchId,
      p_username: ctx.viewerName,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      await ctx.say(`@${ctx.viewerName}, something went wrong redeeming that.`);
      return true;
    }
    if (!row.ok) {
      await ctx.say(`@${ctx.viewerName}, ${REASONS[row.reason] ?? row.reason}.`);
      return true;
    }

    await ctx.say(`✅ @${ctx.viewerName} redeemed "${row.item_name}"! ${row.remaining_points} Points left. The creator will fulfill it shortly.`);
    await broadcast(ctx.env, `shop:${ctx.streamerId}`, 'redemption', {
      viewer: ctx.viewerName,
      item: row.item_name,
      redemptionId: row.redemption_id,
    }).catch(() => undefined);
    return true;
  }

  return false;
}

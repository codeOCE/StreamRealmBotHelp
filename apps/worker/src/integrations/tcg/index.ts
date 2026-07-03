import type { Integration } from '../types';

/**
 * TCG — the standalone Trading Card Game product (tcg.creatorcastle.gg) plugged
 * in as a `product` integration. It runs in its own worker on the SHARED
 * Supabase project, so CreatorCastle only surfaces it in the catalog and links
 * out; there are no in-app config routes here. Enabling it just records intent
 * (and can later flip a flag the TCG worker reads).
 */

const tcg: Integration = {
  manifest: {
    id: 'tcg',
    name: 'Trading Card Game',
    description: 'Let viewers collect, trade, and battle with channel cards.',
    icon: 'Layers',
    category: 'product',
    externalUrl: 'https://tcg.creatorcastle.gg',
  },
  // No `handle`: lifecycle (enable/disable) is handled generically by the router.
};

export default tcg;

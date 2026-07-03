import type { Integration } from './types';
import bingo from './bingo';
import wheelSpin from './wheel-spin';
import winLossDraw from './win-loss-draw';
import rank from './rank';
import tcg from './tcg';

/**
 * The integration registry. To add an integration: create
 * `src/integrations/<id>/index.ts` exporting a default {@link Integration},
 * then add it to this list. The router and catalog pick it up automatically.
 */
export const integrations: Integration[] = [bingo, wheelSpin, winLossDraw, rank, tcg];

const byId = new Map(integrations.map((i) => [i.manifest.id, i]));

export function getIntegration(id: string): Integration | undefined {
  return byId.get(id);
}

export function isIntegrationId(id: string): boolean {
  return byId.has(id);
}

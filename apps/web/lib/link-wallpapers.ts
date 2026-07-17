/**
 * Curated wallpaper presets for the link-in-bio page. The key is stored in
 * bot.links_pages.wallpaper (validated against this list in the worker), the
 * CSS is resolved here so both the dashboard picker and the public page render
 * identically. 'default' tints with the creator's accent color.
 */
export interface Wallpaper {
  key: string;
  name: string;
  css: (accent: string) => string;
}

export const WALLPAPERS: Wallpaper[] = [
  { key: 'default',  name: 'Castle',   css: (a) => `radial-gradient(700px at 50% -150px, ${a}2e, transparent), var(--color-background)` },
  { key: 'midnight', name: 'Midnight', css: () => 'linear-gradient(180deg, #0b1026 0%, #050508 100%)' },
  { key: 'royal',    name: 'Royal',    css: () => 'linear-gradient(160deg, #1a0b2e 0%, #2d1b4e 55%, #0f0a1e 100%)' },
  { key: 'ember',    name: 'Ember',    css: () => 'linear-gradient(160deg, #2a0a0a 0%, #4a1c0c 60%, #120505 100%)' },
  { key: 'forest',   name: 'Forest',   css: () => 'linear-gradient(160deg, #06170e 0%, #0d3320 60%, #04100a 100%)' },
  { key: 'ocean',    name: 'Ocean',    css: () => 'linear-gradient(160deg, #041526 0%, #0a3050 60%, #030d18 100%)' },
  { key: 'sunset',   name: 'Sunset',   css: () => 'linear-gradient(160deg, #2b0f2e 0%, #7a2048 55%, #b4513a 115%)' },
  { key: 'gold',     name: 'Gold',     css: () => 'linear-gradient(160deg, #171204 0%, #3d2f0a 60%, #100c03 100%)' },
  { key: 'aurora',   name: 'Aurora',   css: () => 'linear-gradient(160deg, #071a1c 0%, #103a2e 45%, #1b2b5a 100%)' },
  { key: 'slate',    name: 'Slate',    css: () => 'linear-gradient(180deg, #16181d 0%, #0a0b0e 100%)' },
];

export function wallpaperCss(key: string | null | undefined, accent: string): string {
  return (WALLPAPERS.find((w) => w.key === key) ?? WALLPAPERS[0]).css(accent);
}

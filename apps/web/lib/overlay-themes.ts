import { ALERT_PRESETS } from './alert-presets';

/**
 * Complete ready-made overlay themes: a full 1920x1080 scene (alert box, chat,
 * event list, goal bar…) arranged and styled as one cohesive look. Picking a
 * theme when creating an overlay stamps these widgets onto it; everything stays
 * fully editable in the overlay editor afterwards.
 *
 * Alert styling reuses ALERT_PRESETS bundles (alert-presets.ts) so the alert
 * box matches the theme and stays connected to the preset gallery.
 */

export interface ThemeWidget {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  config?: Record<string, any>;
  styles?: Record<string, any>;
}

export interface OverlayTheme {
  id: string;
  name: string;
  description: string;
  /** Swatch + preview tint for the gallery card. */
  accent: string;
  widgets: ThemeWidget[];
}

/** Alert widget pre-loaded with one of the alert presets. */
function alertWidget(presetId: string, pos: { x: number; y: number; width: number; height: number }): ThemeWidget {
  const p = ALERT_PRESETS.find((x) => x.id === presetId);
  return {
    type: 'alert',
    ...pos,
    config: p ? { htmlTemplate: p.html, customCss: p.css, customJs: p.js, presetId: p.id } : {},
  };
}

export const OVERLAY_THEMES: OverlayTheme[] = [
  {
    id: 'castle-court',
    name: 'Castle Court',
    description: 'Gold and parchment — Royal Decree alerts, a courtly chat column, and a treasury goal bar.',
    accent: '#d4af37',
    widgets: [
      alertWidget('royal-decree', { x: 680, y: 60, width: 560, height: 320 }),
      {
        type: 'chat', x: 24, y: 540, width: 380, height: 500,
        config: { fontSize: 14, backgroundColor: 'rgba(26,20,16,0.55)', textColor: '#f5ead1', usernameColor: 'custom', customUsernameColor: '#d4af37' },
        styles: { borderRadius: 14 },
      },
      {
        type: 'eventlist', x: 1576, y: 40, width: 320, height: 260,
        config: { title: 'Court Records', max: 6 },
        styles: { color: '#f5ead1', backgroundColor: 'rgba(26,20,16,0.55)', borderRadius: 14 },
      },
      {
        type: 'goal', x: 660, y: 984, width: 600, height: 76,
        config: { title: 'Follower Goal', goalType: 'follows', target: 100 },
        styles: { barColor: '#d4af37', backgroundColor: 'rgba(26,20,16,0.7)', borderRadius: 14, color: '#f5ead1' },
      },
    ],
  },
  {
    id: 'neon-district',
    name: 'Neon District',
    description: 'Cyberpunk magenta/cyan — glitch alerts, neon chat, and a slim goal strip up top.',
    accent: '#f015d6',
    widgets: [
      alertWidget('neon-pulse', { x: 680, y: 90, width: 560, height: 320 }),
      {
        type: 'chat', x: 1516, y: 540, width: 380, height: 500,
        config: { fontSize: 14, backgroundColor: 'rgba(6,4,12,0.6)', textColor: '#e8e6ff', usernameColor: 'custom', customUsernameColor: '#00f0ff' },
        styles: { borderRadius: 10 },
      },
      {
        type: 'eventlist', x: 24, y: 40, width: 320, height: 260,
        config: { title: 'Feed', max: 6 },
        styles: { color: '#e8e6ff', backgroundColor: 'rgba(6,4,12,0.6)', borderRadius: 10 },
      },
      {
        type: 'goal', x: 24, y: 984, width: 520, height: 76,
        config: { title: 'Sub Goal', goalType: 'subs', target: 50 },
        styles: { barColor: '#f015d6', backgroundColor: 'rgba(6,4,12,0.7)', borderRadius: 10, color: '#e8e6ff' },
      },
    ],
  },
  {
    id: 'minimal-studio',
    name: 'Minimal Studio',
    description: 'Quiet and clean — a single accent line, transparent chat, nothing shouting.',
    accent: '#ffffff',
    widgets: [
      alertWidget('minimal-line', { x: 60, y: 60, width: 520, height: 240 }),
      {
        type: 'chat', x: 24, y: 620, width: 360, height: 420,
        config: { fontSize: 14, backgroundColor: 'rgba(0,0,0,0.25)', textColor: '#ffffff', showBadges: false },
        styles: { borderRadius: 12 },
      },
      {
        type: 'eventlist', x: 1596, y: 900, width: 300, height: 150,
        config: { title: '', max: 3 },
        styles: { color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12, opacity: 0.85 },
      },
    ],
  },
  {
    id: 'cosmic-drift',
    name: 'Cosmic Drift',
    description: 'Deep-space indigo — nebula alerts with twinkling stars, floating chat, and a stellar goal.',
    accent: '#818cf8',
    widgets: [
      alertWidget('cosmic', { x: 680, y: 60, width: 560, height: 320 }),
      {
        type: 'chat', x: 24, y: 540, width: 380, height: 500,
        config: { fontSize: 14, backgroundColor: 'rgba(13,11,36,0.55)', textColor: '#e4e4ff', usernameColor: 'custom', customUsernameColor: '#818cf8' },
        styles: { borderRadius: 18 },
      },
      {
        type: 'eventlist', x: 1576, y: 40, width: 320, height: 260,
        config: { title: 'Transmissions', max: 6 },
        styles: { color: '#e4e4ff', backgroundColor: 'rgba(13,11,36,0.55)', borderRadius: 18 },
      },
      {
        type: 'goal', x: 660, y: 984, width: 600, height: 76,
        config: { title: 'Follower Goal', goalType: 'follows', target: 100 },
        styles: { barColor: '#818cf8', backgroundColor: 'rgba(13,11,36,0.7)', borderRadius: 18, color: '#e4e4ff' },
      },
    ],
  },
  {
    id: 'arcade-cabinet',
    name: 'Arcade Cabinet',
    description: '8-bit terminal green — pixel alerts, scanline chat, insert coin to continue.',
    accent: '#34d399',
    widgets: [
      alertWidget('retro-arcade', { x: 680, y: 80, width: 560, height: 300 }),
      {
        type: 'chat', x: 1516, y: 540, width: 380, height: 500,
        config: { fontSize: 14, backgroundColor: 'rgba(10,10,18,0.65)', textColor: '#c8ffe8', usernameColor: 'custom', customUsernameColor: '#34d399' },
        styles: { borderRadius: 4 },
      },
      {
        type: 'eventlist', x: 24, y: 40, width: 320, height: 260,
        config: { title: 'High Scores', max: 6 },
        styles: { color: '#c8ffe8', backgroundColor: 'rgba(10,10,18,0.65)', borderRadius: 4 },
      },
      {
        type: 'goal', x: 24, y: 984, width: 520, height: 76,
        config: { title: '1UP Goal', goalType: 'follows', target: 100 },
        styles: { barColor: '#34d399', backgroundColor: 'rgba(10,10,18,0.75)', borderRadius: 4, color: '#c8ffe8' },
      },
    ],
  },
];

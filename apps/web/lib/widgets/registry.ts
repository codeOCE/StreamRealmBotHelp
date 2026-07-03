// ============================================================================
// Widget registry — first-party source of truth.
// ----------------------------------------------------------------------------
// Every widget type is registered here. The editor palette, default config on
// add, the auto-generated properties panel, and the renderer's bundle-vs-native
// decision all read from this map. Adding a new bundle widget = drop a file in
// definitions/ and register it here; no edits to the renderer or editor switch.
// ============================================================================

import type { WidgetDefinition } from './types';
import tcgPack from './definitions/tcg-pack';
import goalBar from './definitions/goal-bar';
import tipLeaderboard from './definitions/tip-leaderboard';
import tipTicker from './definitions/tip-ticker';
import countdown from './definitions/countdown';
import emoteWall from './definitions/emote-wall';

// Native (legacy React-rendered) widgets. Registered for palette + defaults; their
// bodies still live in the renderer/editor switch and their bespoke property panels
// remain until each is migrated to a bundle. `fields` here is intentionally light —
// the hand-built panels stay authoritative for native widgets for now.
const nativeDefs: WidgetDefinition[] = [
    {
        type: 'text', name: 'Text', icon: 'Type', renderMode: 'native',
        defaultSize: { width: 300, height: 200 }, listens: [], fields: {},
    },
    {
        type: 'image', name: 'Image', icon: 'Image', renderMode: 'native',
        defaultSize: { width: 300, height: 200 }, listens: [], fields: {},
    },
    {
        type: 'chat', name: 'Chat', icon: 'MessageSquare', renderMode: 'native',
        defaultSize: { width: 300, height: 200 }, listens: ['message'], fields: {},
    },
    {
        type: 'alert', name: 'Alert', icon: 'Bell', renderMode: 'native',
        defaultSize: { width: 560, height: 320 },
        listens: ['follower-latest', 'subscriber-latest', 'cheer-latest', 'raid-latest', 'tip-latest'],
        fields: {},
    },
    {
        type: 'goal', name: 'Goal', icon: 'Zap', renderMode: 'native',
        defaultSize: { width: 300, height: 200 }, listens: ['goal-update'], fields: {},
    },
    {
        type: 'label', name: 'Label', icon: 'Layers', renderMode: 'native',
        defaultSize: { width: 300, height: 200 }, listens: [], fields: {},
    },
    {
        type: 'eventlist', name: 'Events', icon: 'ScrollText', renderMode: 'native',
        defaultSize: { width: 320, height: 300 },
        listens: ['follower-latest', 'subscriber-latest', 'cheer-latest', 'raid-latest', 'tip-latest'],
        fields: {},
    },
];

const bundleDefs: WidgetDefinition[] = [
    tcgPack,
    goalBar,
    tipLeaderboard,
    tipTicker,
    countdown,
    emoteWall,
];

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = Object.fromEntries(
    [...nativeDefs, ...bundleDefs].map((d) => [d.type, d]),
);

export function getWidgetDefinition(type: string): WidgetDefinition | undefined {
    return WIDGET_REGISTRY[type];
}

/** True when the widget renders as a sandboxed iframe bundle. */
export function isBundleWidget(type: string): boolean {
    return WIDGET_REGISTRY[type]?.renderMode === 'bundle';
}

/** All widgets that should appear in the editor's Quick Add palette. */
export function paletteWidgets(): WidgetDefinition[] {
    return Object.values(WIDGET_REGISTRY);
}

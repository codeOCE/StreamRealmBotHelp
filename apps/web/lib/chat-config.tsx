'use client';

import React, { useEffect, useState } from 'react';

// Shared chat-widget logic + renderer, used by the editor preview and the live
// overlay so they always look identical.

export type ChatPlatform = 'twitch' | 'youtube' | 'kick' | 'tiktok';

export type Badge = string | { setId: string; version: string };

export interface ChatMessage {
    username: string;
    message: string;
    color?: string;             // user's own colour (Twitch name colour)
    platform?: ChatPlatform;    // defaults to twitch
    badges?: Badge[];           // setId+version (real images) or legacy setId string
    roomId?: string;            // Twitch channel id, for channel-specific badges
    emotes?: Record<string, string[]>; // tmi emote map: { emoteId: ["start-end", …] }
    _t?: number;                // receive time (for lifetime fade)
}

export interface ChatConfig {
    platforms: ChatPlatform[];
    maxMessages: number;
    messageLifetime: number;    // seconds; 0 = never fade
    fontSize: number;
    hideCommands: boolean;
    hideBots: boolean;
    showPlatformIcons: boolean;
    platformLogos: boolean;     // true = brand logos, false = coloured dots
    showBadges: boolean;
    showEmotes: boolean;
    usernameColor: 'platform' | 'user' | 'custom';
    customUsernameColor: string;
    textColor: string;
    backgroundColor: string;
}

export const PLATFORMS: { id: ChatPlatform; label: string; color: string }[] = [
    { id: 'twitch', label: 'Twitch', color: '#9146FF' },
    { id: 'youtube', label: 'YouTube', color: '#FF0000' },
    { id: 'kick', label: 'Kick', color: '#53FC18' },
    { id: 'tiktok', label: 'TikTok', color: '#25F4EE' },
];
const PLATFORM_COLOR: Record<ChatPlatform, string> = Object.fromEntries(
    PLATFORMS.map(p => [p.id, p.color]),
) as Record<ChatPlatform, string>;

const BADGES: Record<string, { label: string; color: string }> = {
    broadcaster: { label: 'HOST', color: '#e91916' },
    moderator: { label: 'MOD', color: '#00ad03' },
    vip: { label: 'VIP', color: '#e005b9' },
    subscriber: { label: 'SUB', color: '#9146FF' },
    founder: { label: 'SUB', color: '#9146FF' },
};

// Common chat-bot accounts to hide when "hide bots" is on.
const BOT_NAMES = new Set([
    'nightbot', 'streamelements', 'streamlabs', 'moobot', 'fossabot',
    'wizebot', 'sery_bot', 'pretzelrocks', 'soundalerts', 'creatorcastle',
]);

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
    platforms: ['twitch'],
    maxMessages: 10,
    messageLifetime: 0,
    fontSize: 14,
    hideCommands: true,
    hideBots: true,
    showPlatformIcons: true,
    platformLogos: false,
    showBadges: true,
    showEmotes: true,
    usernameColor: 'platform',
    customUsernameColor: '#3faaff',
    textColor: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.45)',
};

export function getChatConfig(raw: Record<string, any> = {}): ChatConfig {
    return {
        ...DEFAULT_CHAT_CONFIG,
        ...raw,
        // Never let an empty platform list hide everything.
        platforms: Array.isArray(raw.platforms) && raw.platforms.length ? raw.platforms : DEFAULT_CHAT_CONFIG.platforms,
    };
}

export function filterChatMessage(cfg: ChatConfig, msg: ChatMessage): boolean {
    const platform = msg.platform || 'twitch';
    if (!cfg.platforms.includes(platform)) return false;
    if (cfg.hideCommands && msg.message.trim().startsWith('!')) return false;
    if (cfg.hideBots && BOT_NAMES.has((msg.username || '').toLowerCase())) return false;
    return true;
}

export function usernameColorFor(cfg: ChatConfig, msg: ChatMessage): string {
    if (cfg.usernameColor === 'custom') return cfg.customUsernameColor;
    if (cfg.usernameColor === 'user') return msg.color || cfg.customUsernameColor;
    return PLATFORM_COLOR[msg.platform || 'twitch'] || cfg.customUsernameColor;
}

// Sample feed for the editor so the options visibly do something with no live chat.
export function sampleChatMessages(platforms: ChatPlatform[]): ChatMessage[] {
    const base: Omit<ChatMessage, 'platform'>[] = [
        { username: 'NightRider', message: 'this overlay is clean 🔥', badges: ['subscriber'] },
        { username: 'PixelQueen', message: 'GGz everyone', badges: ['moderator'] },
        { username: 'ByteMe', message: '!uptime', badges: [] },
        { username: 'StreamFan42', message: 'first time here, loving it', badges: [] },
        { username: 'VIPViewer', message: 'POG', badges: ['vip'] },
        { username: 'Nightbot', message: 'Follow for more!', badges: [] },
    ];
    return base.map((m, i) => ({ ...m, platform: platforms[i % platforms.length] || 'twitch' }));
}

// ── Real Twitch badge images ────────────────────────────────────────────────
// Twitch's unauthenticated badge endpoints map (setId, version) → image URL.
// Global covers mod/vip/broadcaster/turbo/etc; channel covers subscriber/bits.
// ponytail: legacy v1 endpoints, no token needed. If Twitch drops them, resolve
// via Helix on the backend and send image URLs in the chat payload instead.
type BadgeSets = Record<string, { versions: Record<string, { image_url_1x: string; image_url_2x: string; image_url_4x: string }> }>;
const globalBadges: { map?: BadgeSets; loading?: Promise<void> } = {};
const channelBadges: Record<string, BadgeSets | 'loading'> = {};

function useTwitchBadges(roomId?: string) {
    const [, force] = useState(0);
    useEffect(() => {
        let alive = true;
        const bump = () => alive && force(n => n + 1);
        if (!globalBadges.map && !globalBadges.loading) {
            globalBadges.loading = fetch('https://badges.twitch.tv/v1/badges/global/display')
                .then(r => r.json()).then(j => { globalBadges.map = j.badge_sets; }).catch(() => { });
        }
        globalBadges.loading?.then(bump);
        if (roomId && !channelBadges[roomId]) {
            channelBadges[roomId] = 'loading';
            fetch(`https://badges.twitch.tv/v1/badges/channels/${roomId}/display`)
                .then(r => r.json()).then(j => { channelBadges[roomId] = j.badge_sets; bump(); })
                .catch(() => { channelBadges[roomId] = {}; });
        }
        return () => { alive = false; };
    }, [roomId]);

    return (setId: string, version: string): string | undefined => {
        const ch = roomId && channelBadges[roomId] !== 'loading' ? channelBadges[roomId] as BadgeSets : undefined;
        const set = ch?.[setId] ?? globalBadges.map?.[setId];
        return (set?.versions?.[version] ?? set?.versions?.['1'])?.image_url_2x;
    };
}

function normalizeBadges(badges?: Badge[]): { setId: string; version: string }[] {
    return (badges || []).map(b => (typeof b === 'string' ? { setId: b, version: '1' } : b));
}

// ── Platform brand logos ─────────────────────────────────────────────────────
const LOGO_PATHS: Partial<Record<ChatPlatform, string>> = {
    twitch: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z',
    youtube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12z',
    tiktok: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
};

function PlatformLogo({ platform, size }: { platform: ChatPlatform; size: number }) {
    const color = PLATFORM_COLOR[platform];
    const path = LOGO_PATHS[platform];
    if (path) {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ verticalAlign: 'middle' }} aria-hidden>
                <path d={path} />
            </svg>
        );
    }
    // Kick has no single-glyph mark — brand-green chip with a bold K.
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, background: color, color: '#000', borderRadius: size * 0.22, fontSize: size * 0.7, fontWeight: 900, verticalAlign: 'middle' }}>K</span>
    );
}

// ── Twitch emotes → images ───────────────────────────────────────────────────
// tmi emote map is { emoteId: ["start-end", …] } with code-point indices.
function renderMessageBody(message: string, emotes?: Record<string, string[]>, em = 1.4): React.ReactNode {
    if (!emotes || Object.keys(emotes).length === 0) return message;
    const ranges: { start: number; end: number; id: string }[] = [];
    for (const [id, list] of Object.entries(emotes)) {
        for (const r of list) { const [s, e] = r.split('-').map(Number); ranges.push({ start: s, end: e, id }); }
    }
    ranges.sort((a, b) => a.start - b.start);
    const chars = [...message]; // code points, matching Twitch indices
    const out: React.ReactNode[] = [];
    let cursor = 0;
    ranges.forEach((r, i) => {
        if (r.start > cursor) out.push(chars.slice(cursor, r.start).join(''));
        const name = chars.slice(r.start, r.end + 1).join('');
        out.push(
            <img
                key={`e${i}`}
                src={`https://static-cdn.jtvnw.net/emoticons/v2/${r.id}/default/dark/2.0`}
                alt={name}
                title={name}
                style={{ height: `${em}em`, verticalAlign: 'middle', margin: '0 0.05em' }}
            />,
        );
        cursor = r.end + 1;
    });
    if (cursor < chars.length) out.push(chars.slice(cursor).join(''));
    return out;
}

export function ChatList({ messages, config, styles }: {
    messages: ChatMessage[];
    config: Record<string, any>;
    styles: Record<string, any>;
}) {
    const cfg = getChatConfig(config);
    const bg = config?.backgroundColor ?? styles?.backgroundColor ?? cfg.backgroundColor;
    const radius = styles?.borderRadius ?? 0;

    // Re-render on a tick so lifetime fade actually expires messages.
    const [, force] = useState(0);
    useEffect(() => {
        if (!cfg.messageLifetime) return;
        const i = setInterval(() => force(n => n + 1), 1000);
        return () => clearInterval(i);
    }, [cfg.messageLifetime]);

    const now = Date.now();
    const visible = messages
        .filter(m => filterChatMessage(cfg, m))
        .filter(m => !cfg.messageLifetime || !m._t || now - m._t < cfg.messageLifetime * 1000)
        .slice(-cfg.maxMessages);

    const roomId = visible.find(m => m.roomId)?.roomId;
    const resolveBadge = useTwitchBadges(roomId);

    return (
        <div
            className="w-full h-full flex flex-col justify-end gap-1.5 p-3 overflow-hidden backdrop-blur-sm"
            style={{ background: bg, borderRadius: radius, fontSize: cfg.fontSize, color: cfg.textColor }}
        >
            {visible.length === 0 ? (
                <div className="flex-1 flex items-center justify-center opacity-25">
                    <span className="italic" style={{ fontSize: cfg.fontSize }}>Waiting for messages…</span>
                </div>
            ) : visible.map((m, i) => (
                <div key={i} className="leading-snug animate-in slide-in-from-left-2 fade-in duration-300">
                    {cfg.showPlatformIcons && (
                        cfg.platformLogos ? (
                            <span className="inline-block align-middle mr-1.5"><PlatformLogo platform={m.platform || 'twitch'} size={cfg.fontSize} /></span>
                        ) : (
                            <span
                                className="inline-block rounded-full align-middle mr-1.5"
                                style={{ width: '0.5em', height: '0.5em', background: PLATFORM_COLOR[m.platform || 'twitch'] }}
                            />
                        )
                    )}
                    {cfg.showBadges && normalizeBadges(m.badges).map((b, bi) => {
                        const url = resolveBadge(b.setId, b.version);
                        if (url) return <img key={bi} src={url} alt={b.setId} title={b.setId} className="inline-block align-middle mr-1" style={{ height: '1em' }} />;
                        const chip = BADGES[b.setId];
                        return chip ? (
                            <span key={bi} className="inline-block align-middle mr-1 rounded font-black uppercase" style={{ background: chip.color, color: '#fff', fontSize: '0.6em', padding: '0.1em 0.35em' }}>{chip.label}</span>
                        ) : null;
                    })}
                    <span className="font-bold" style={{ color: usernameColorFor(cfg, m) }}>{m.username}</span>
                    <span style={{ opacity: 0.5 }}>: </span>
                    <span style={{ opacity: 0.95 }}>{cfg.showEmotes ? renderMessageBody(m.message, m.emotes) : m.message}</span>
                </div>
            ))}
        </div>
    );
}

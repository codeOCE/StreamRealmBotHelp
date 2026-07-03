"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Grid3x3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { connectRealtime } from '@/lib/realtime';
import { FeatureHeader } from '@/components/dashboard/FeatureUI';

const API_BASE = apiUrl('/api/integrations/bingo');

interface ChannelPoints {
  enabled: boolean;
  rewardId: string | null;
  cost: number;
  cardsPerRedemption: number;
  maxPerUser: number;
}
interface Entitlements {
  base: number;
  allowMultiple: boolean;
  subTierCards: Record<string, number>;
  channelPoints: ChannelPoints;
}
type WinPattern = 'line' | 'double_line' | 'four_corners' | 'x' | 'full';
interface Tile { id: string; label?: string; image?: string; count: number }
interface CardStyle {
  markStyle?: 'cross' | 'dot' | 'check' | 'star' | 'image';
  markColor?: string;
  markImage?: string;
  tileFont?: string;
  tileFontUrl?: string;
  tileTextColor?: string;
}
interface Game {
  id: string;
  title: string;
  size: number;
  freeSpace: boolean;
  winCondition: WinPattern;
  tiles: Tile[];
  called: string[]; // ordered tile-id call log
  calledCounts?: Record<string, number>;
  status: 'draft' | 'active' | 'ended';
  entitlements?: Entitlements;
  reward?: string | null;
  reviewMode?: 'auto' | 'manual';
  cardStyle?: CardStyle;
  shortCode?: string | null;
}

const MARK_STYLES: { id: NonNullable<CardStyle['markStyle']>; label: string }[] = [
  { id: 'cross', label: '<svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Cross' },
  { id: 'dot', label: '● Dot' },
  { id: 'check', label: '✔ Check' },
  { id: 'star', label: '★ Star' },
];
const TILE_FONTS = ['', 'Inter', 'Montserrat', 'Oswald', 'Bebas Neue', 'Poppins', 'Rajdhani', 'Press Start 2P', 'Comic Neue'];

/** Parse the tiles textarea: one tile per line; trailing `×N` / `xN` / `*N` sets
 * the multi-check count (e.g. "First blood ×3"). */
function parseTiles(text: string): { label: string; count: number }[] {
  return text
    .split('\n')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)\s*[×x*]\s*(\d+)\s*$/i);
      if (m && Number(m[2]) > 1) return { label: m[1].trim(), count: Math.min(9, Number(m[2])) };
      return { label: line, count: 1 };
    });
}
/** Serialize tiles back into the textarea form (label + ×N when >1). */
function tilesToText(tiles: Tile[]): string {
  return (tiles || []).filter((t) => !t.image).map((t) => (t.count > 1 ? `${t.label} ×${t.count}` : t.label || '')).join('\n');
}

/** Upload a tile image; returns its public URL (or null). */
async function uploadImage(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE}/upload/image`, { method: 'POST', credentials: 'include', body: fd });
  if (!res.ok) { alert((await res.json().catch(() => ({}))).error || 'Upload failed'); return null; }
  return (await res.json()).url as string;
}

const PATTERNS: { id: WinPattern; label: string }[] = [
  { id: 'line', label: 'Any line' },
  { id: 'double_line', label: 'Two lines' },
  { id: 'four_corners', label: 'Four corners' },
  { id: 'x', label: 'X (diagonals)' },
  { id: 'full', label: 'Full board' },
];

const TILE_TEMPLATES: { name: string; tiles: string[] }[] = [
  {
    name: 'Just Chatting',
    tiles: [
      'Streamer says "um"', 'Chat spams LUL', 'Technical difficulties', 'Sips a drink',
      'Reads a donation', 'Goes on a tangent', 'Mentions sleep schedule', 'Pet appears on cam',
      'Doorbell / delivery', 'Apologizes for the mic', 'Checks phone', 'Says "let me cook"',
      'Raids another streamer', 'Forgets what they were saying', 'Plugs the merch', 'Sneezes',
      'Lighting / window comment', 'Chat backseats', 'New follower alert', 'Says "real quick"',
      'Adjusts the camera', 'Hits a bit goal', 'Talks about food', 'Laughs at own joke', 'Says "chat"',
    ],
  },
  {
    name: 'Gaming',
    tiles: [
      'Dies to a boss', 'Threatens to rage quit', 'Blames the lag', 'Forgets the objective',
      'Falls off a ledge', 'Friendly fire', 'Brags about loot', 'Misses an easy shot',
      '"One more game"', 'Backseat gamers', 'Inventory full', 'Presses the wrong button',
      'Trash talks an NPC', 'Gets jump-scared', 'Explains speedrun strats', 'Reads patch notes',
      'Alt-tabs away', 'Mic peaks yelling', 'Clutch play', 'Salt about teammates',
      'Regrets skipping the tutorial', 'New personal best', 'Crashes / DC', 'Talks to chat mid-fight', 'Saves the game',
    ],
  },
];

interface Winner {
  id: string;
  name: string;
  bingo_at: string;
}
interface Font { id: string; name: string; family: string; url: string }

/** Inject @font-face rules so uploaded fonts render in selects/previews. */
function FontFaces({ fonts }: { fonts: Font[] }) {
  if (!fonts.length) return null;
  return (
    <style>{fonts.map((f) => `@font-face{font-family:'${f.family}';src:url('${f.url}');font-display:swap;}`).join('\n')}</style>
  );
}

export default function BingoPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [cardCount, setCardCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Create-form state
  const [title, setTitle] = useState('Stream Bingo');
  const [size, setSize] = useState(5);
  const [freeSpace, setFreeSpace] = useState(true);
  const [winCondition, setWinCondition] = useState<WinPattern>('line');
  const [tilesText, setTilesText] = useState('');
  const [reward, setReward] = useState('');
  const [reviewMode, setReviewMode] = useState<'auto' | 'manual'>('auto');
  const [markColor, setMarkColor] = useState('#9333ea');
  const [markStyle, setMarkStyle] = useState<NonNullable<CardStyle['markStyle']>>('cross');
  const [imageTiles, setImageTiles] = useState<{ label: string; image: string; count: number }[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; size: number; freeSpace: boolean; winCondition: WinPattern; tiles: Tile[]; cardStyle: CardStyle }[]>([]);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [tileFont, setTileFont] = useState('');

  const selected = games.find((g) => g.id === selectedId) || null;

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(API_BASE, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setEnabled(Boolean(data.enabled));
      } else {
        setEnabled(false);
      }
    } catch {
      setEnabled(false);
    }
  }, []);

  const loadGames = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/games`, { credentials: 'include' });
      const data = await res.json();
      setGames(data.games || []);
    } catch (e) {
      console.error('Failed to load bingo games', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/games/${id}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setWinners(data.winners || []);
      setCardCount(data.cardCount || 0);
      setGames((prev) => prev.map((g) => (g.id === id ? data.game : g)));
    } catch (e) {
      console.error('Failed to load game detail', e);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    const res = await fetch(`${API_BASE}/templates`, { credentials: 'include' });
    if (res.ok) setTemplates((await res.json()).templates || []);
  }, []);

  const loadFonts = useCallback(async () => {
    const res = await fetch(apiUrl('/api/fonts'), { credentials: 'include' });
    if (res.ok) setFonts((await res.json()).fonts || []);
  }, []);

  useEffect(() => {
    loadStatus();
    loadGames();
    loadTemplates();
    loadFonts();
  }, [loadStatus, loadGames, loadTemplates, loadFonts]);

  const fontUrl = (family: string) => fonts.find((f) => f.family === family)?.url;

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTitle(t.name);
    setSize(t.size);
    setFreeSpace(t.freeSpace);
    setWinCondition(t.winCondition);
    setTilesText(tilesToText(t.tiles));
    setImageTiles(t.tiles.filter((x) => x.image).map((x) => ({ label: x.label || '', image: x.image!, count: x.count })));
    if (t.cardStyle?.markColor) setMarkColor(t.cardStyle.markColor);
    if (t.cardStyle?.markStyle) setMarkStyle(t.cardStyle.markStyle);
  };

  const saveTemplate = async (game: Game) => {
    const name = prompt('Template name?', game.title);
    if (!name) return;
    await fetch(`${API_BASE}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, size: game.size, freeSpace: game.freeSpace, winCondition: game.winCondition, tiles: game.tiles, cardStyle: game.cardStyle ?? {} }),
    });
    loadTemplates();
  };

  const deleteTemplate = async (id: string) => {
    await fetch(`${API_BASE}/templates/${id}`, { method: 'DELETE', credentials: 'include' });
    loadTemplates();
  };

  // Refresh detail + subscribe to realtime when managing a game.
  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId);
    const disconnect = connectRealtime(`bingo:${selectedId}`, (event) => {
      if (['bingo.winner', 'bingo.called', 'bingo.reset', 'bingo.submitted', 'bingo.denied', 'bingo.joined'].includes(event)) {
        loadDetail(selectedId);
      }
    });
    return disconnect;
  }, [selectedId, loadDetail]);

  const enable = async () => {
    await fetch(`${API_BASE}/enable`, { method: 'POST', credentials: 'include' });
    setEnabled(true);
  };

  const createGame = async () => {
    setCreating(true);
    try {
      if (!enabled) await enable();
      const tiles = [
        ...parseTiles(tilesText),
        ...imageTiles.filter((t) => t.image.trim()).map((t) => ({ label: t.label.trim(), image: t.image.trim(), count: Math.max(1, t.count) })),
      ];
      const res = await fetch(`${API_BASE}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title, size, freeSpace, winCondition, tiles,
          reward: reward.trim() || null,
          reviewMode,
          cardStyle: { markColor, markStyle, tileFont, tileFontUrl: fontUrl(tileFont) },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setGames((prev) => [data.game, ...prev]);
        setSelectedId(data.game.id);
        setTilesText(''); setReward(''); setImageTiles([]);
        setTitle('Stream Bingo');
      } else {
        alert(data.error || 'Failed to create game');
      }
    } finally {
      setCreating(false);
    }
  };

  const action = async (id: string, path: string, body?: any) => {
    const res = await fetch(`${API_BASE}/games/${id}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Action failed');
      return;
    }
    if (data.game) setGames((prev) => prev.map((g) => (g.id === id ? data.game : g)));
    loadDetail(id);
  };

  const deleteGame = async (id: string) => {
    if (!confirm('Delete this bingo game and all its cards?')) return;
    await fetch(`${API_BASE}/games/${id}`, { method: 'DELETE', credentials: 'include' });
    setGames((prev) => prev.filter((g) => g.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const patchGame = async (id: string, body: any) => {
    const res = await fetch(`${API_BASE}/games/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Save failed');
      return;
    }
    if (data.game) setGames((prev) => prev.map((g) => (g.id === id ? data.game : g)));
  };

  if (loading) {
    return (
      <div className="py-40 flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin shadow-glow-p" />
        <p className="text-brand-primary/40 font-black  text-[10px]">Loading bingo…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <FontFaces fonts={fonts} />
      <FeatureHeader
        icon={Grid3x3}
        title="Bingo"
        subtitle="Set the tiles — viewers generate their own cards and mark them live as you call."
      >
        {selected && (
          <button onClick={() => setSelectedId(null)} className="saas-button-secondary">
            ← All games
          </button>
        )}
      </FeatureHeader>

      {!selected && <ChatCommandToggle />}

      {selected ? (
        <ManageGame
          key={selected.id}
          game={selected}
          winners={winners}
          cardCount={cardCount}
          onAction={action}
          onPatch={patchGame}
          onSaveTemplate={saveTemplate}
          fonts={fonts}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Create */}
          <div className="bento-card p-8 space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-black text-white uppercase tracking-tight">New game</h2>
              {templates.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); e.target.value = ''; }}
                  className="void-select void-select-compact max-w-[200px]"
                >
                  <option value="">Start from template…</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </div>
            {templates.length > 0 && (
              <div className="flex flex-wrap gap-2 -mt-2">
                {templates.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/10 text-[10px] font-bold text-zinc-400">
                    {t.name}
                    <button onClick={() => deleteTemplate(t.id)} className="text-zinc-600 hover:text-rose-400"><svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                  </span>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[10px] font-black  text-zinc-500">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:border-brand-primary/50 outline-none"
              />
            </div>
            <div className="flex gap-4">
              <div className="space-y-2 flex-1">
                <label className="text-[10px] font-black  text-zinc-500">Board size</label>
                <select
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="void-select"
                >
                  {[3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>{n} × {n}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 flex-1">
                <label className="text-[10px] font-black  text-zinc-500">Win pattern</label>
                <select
                  value={winCondition}
                  onChange={(e) => setWinCondition(e.target.value as WinPattern)}
                  className="void-select"
                >
                  {PATTERNS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={freeSpace} onChange={(e) => setFreeSpace(e.target.checked)} className="accent-brand-primary w-4 h-4" />
              <span className="text-sm text-zinc-300 font-medium">Free space in the center (odd boards)</span>
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-[10px] font-black  text-zinc-500">
                  Tiles — one per line ({tilesText.split('\n').filter((t) => t.trim()).length})
                </label>
                <div className="flex gap-2">
                  {TILE_TEMPLATES.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => setTilesText(t.tiles.join('\n'))}
                      className="px-3 py-1 rounded-lg bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[10px] font-black  hover:bg-brand-primary/20 transition-all"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={tilesText}
                onChange={(e) => setTilesText(e.target.value)}
                rows={9}
                placeholder={'Streamer dies\nChat spams LUL\nFirst blood ×3   ← needs 3 checks\n…'}
                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:border-brand-primary/50 outline-none resize-y font-mono"
              />
              <p className="text-[10px] text-zinc-600">Add <span className="text-brand-primary">×3</span> after a tile to make it multi-check (must happen 3 times).</p>
            </div>

            {/* Image tiles (e.g. item hunt) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black  text-zinc-500">Image tiles ({imageTiles.length})</label>
                <button type="button" onClick={() => setImageTiles((p) => [...p, { label: '', image: '', count: 1 }])} className="text-brand-primary text-[10px] font-black  hover:underline">+ Add image</button>
              </div>
              {imageTiles.map((t, i) => (
                <div key={i} className="flex gap-2 items-center">
                  {t.image
                    ? <img src={t.image} alt="" className="w-9 h-9 rounded-lg object-cover bg-black/30 shrink-0" />
                    : <label className="w-9 h-9 rounded-lg bg-white/[0.04] border border-dashed border-white/15 shrink-0 flex items-center justify-center cursor-pointer text-zinc-500 hover:text-white text-lg">
                        +<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const url = await uploadImage(f); if (url) setImageTiles((p) => p.map((x, j) => (j === i ? { ...x, image: url } : x))); } }} />
                      </label>}
                  <input value={t.image} onChange={(e) => setImageTiles((p) => p.map((x, j) => (j === i ? { ...x, image: e.target.value } : x)))} placeholder="Image URL or upload →" className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none" />
                  <input value={t.label} onChange={(e) => setImageTiles((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label" className="w-24 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none" />
                  <input type="number" min={1} max={9} value={t.count} onChange={(e) => setImageTiles((p) => p.map((x, j) => (j === i ? { ...x, count: Math.max(1, Number(e.target.value) || 1) } : x)))} className="w-14 bg-white/[0.03] border border-white/10 rounded-xl px-2 py-2 text-white text-xs outline-none" title="checks needed" />
                  <button type="button" onClick={() => setImageTiles((p) => p.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-rose-400 px-1"><svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>
              ))}
            </div>

            {/* Prize / reward */}
            <div className="space-y-2">
              <label className="text-[10px] font-black  text-zinc-500">Prize (optional)</label>
              <input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="e.g. 5000 channel points + a shoutout" className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-brand-primary/50" />
            </div>

            {/* Win check + card style */}
            <div className="flex gap-4 flex-wrap">
              <div className="space-y-2 flex-1 min-w-[160px]">
                <label className="text-[10px] font-black  text-zinc-500">Win check</label>
                <select value={reviewMode} onChange={(e) => setReviewMode(e.target.value as 'auto' | 'manual')} className="void-select">
                  <option value="auto">Auto-validate (instant)</option>
                  <option value="manual">I review submissions</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black  text-zinc-500">Mark</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={markColor} onChange={(e) => setMarkColor(e.target.value)} className="w-10 h-10 rounded-lg bg-transparent border border-white/10 cursor-pointer" />
                  <select value={markStyle} onChange={(e) => setMarkStyle(e.target.value as any)} className="void-select void-select-compact">
                    {MARK_STYLES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black  text-zinc-500">Tile font</label>
                <select value={tileFont} onChange={(e) => setTileFont(e.target.value)} className="void-select void-select-compact">
                  {TILE_FONTS.map((f) => <option key={f} value={f}>{f || 'Default'}</option>)}
                  {fonts.map((f) => <option key={f.id} value={f.family}>{f.name} (yours)</option>)}
                </select>
              </div>
            </div>

            <FontManager fonts={fonts} onChange={loadFonts} />

            <button onClick={createGame} disabled={creating} className="saas-button w-full">
              {creating ? 'Creating…' : 'Create game'}
            </button>
          </div>

          {/* List */}
          <div className="space-y-4">
            <h2 className="text-lg font-black text-white uppercase tracking-tight">Your games</h2>
            {games.length === 0 ? (
              <div className="bento-card py-20 text-center text-zinc-600 font-black  text-[11px]">
                No games yet
              </div>
            ) : (
              games.map((g) => (
                <div
                  key={g.id}
                  className="bento-card p-6 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="font-black text-white truncate">{g.title}</h3>
                      <StatusPill status={g.status} />
                    </div>
                    <p className="text-[11px] text-zinc-500 font-bold  mt-1">
                      {g.size}×{g.size} · {g.tiles.length} tiles · {(PATTERNS.find((p) => p.id === g.winCondition)?.label ?? g.winCondition).toLowerCase()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setSelectedId(g.id)} className="saas-button-secondary text-xs">Manage</button>
                    <button
                      onClick={() => deleteGame(g.id)}
                      className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-zinc-600 hover:text-rose-400 hover:bg-rose-400/10 transition-all"
                      title="Delete"
                    ><svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles =
    status === 'active'
      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
      : status === 'draft'
        ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
        : 'bg-zinc-500/10 border-white/5 text-zinc-500';
  return (
    <span className={cn('px-2.5 py-1 rounded-lg border text-[9px] font-black ', styles)}>
      {status}
    </span>
  );
}

function ManageGame({
  game,
  winners,
  cardCount,
  onAction,
  onPatch,
  onSaveTemplate,
  fonts,
}: {
  game: Game;
  winners: Winner[];
  cardCount: number;
  onAction: (id: string, path: string, body?: any) => void;
  onPatch: (id: string, body: any) => Promise<void>;
  onSaveTemplate: (game: Game) => void;
  fonts: Font[];
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [autoCall, setAutoCall] = useState(false);
  const [autoSecs, setAutoSecs] = useState(20);
  const [tab, setTab] = useState<'live' | 'setup' | 'share' | 'results'>(game.status === 'draft' ? 'setup' : 'live');

  // Jump to the live tab the moment the game starts.
  useEffect(() => {
    if (game.status === 'active') setTab('live');
  }, [game.status]);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // Short share link (/b/<code> redirects to the play page); falls back to the full URL.
  const playLink = game.shortCode ? `${origin}/b/${game.shortCode}` : `${origin}/play/bingo/${game.id}`;
  const overlayLink = `${origin}/overlay/bingo/${game.id}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(playLink)}`;

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  // Auto-call: while ON and the game is active, randomly call an uncalled tile
  // every `autoSecs`. Runs from the dashboard (no persistent server loop needed).
  const calledCounts: Record<string, number> = game.calledCounts || {};
  const tileById = new Map(game.tiles.map((t) => [t.id, t]));

  useEffect(() => {
    if (!autoCall || game.status !== 'active') return;
    const id = setInterval(() => {
      const remaining = game.tiles.filter((t) => (calledCounts[t.id] || 0) < t.count);
      if (remaining.length === 0) {
        setAutoCall(false);
        return;
      }
      const tile = remaining[Math.floor(Math.random() * remaining.length)];
      onAction(game.id, 'call', { tileId: tile.id });
    }, Math.max(3, autoSecs) * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCall, autoSecs, game.status, game.id, game.called.length]);

  // Stop auto-call automatically when the game ends.
  useEffect(() => {
    if (game.status !== 'active' && autoCall) setAutoCall(false);
  }, [game.status, autoCall]);

  return (
    <div className="space-y-8">
      {/* Header / controls */}
      <div className="bento-card p-8 flex flex-wrap items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-black text-white">{game.title}</h2>
            <StatusPill status={game.status} />
          </div>
          <p className="text-[11px] text-zinc-500 font-bold  mt-1">
            {(game as any).round > 1 && <span className="text-purple-400">Round {(game as any).round} · </span>}
            {game.size}×{game.size} · {cardCount} players · {game.called.length}/{game.tiles.length} called
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => onSaveTemplate(game)} className="saas-button-secondary">Save as template</button>
          {game.status === 'draft' && (
            <button onClick={() => onAction(game.id, 'start')} className="saas-button">Start game</button>
          )}
          {game.status === 'active' && (
            <>
              <button onClick={() => onAction(game.id, 'reset')} className="saas-button-secondary">Reset calls</button>
              <button onClick={() => onAction(game.id, 'next-round')} className="saas-button">Next round →</button>
              <button onClick={() => onAction(game.id, 'end')} className="saas-button-secondary">End game</button>
            </>
          )}
          {game.status === 'ended' && (
            <button onClick={() => onAction(game.id, 'next-round')} className="saas-button">Play another round →</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {([['live', 'Live'], ['setup', 'Setup'], ['share', 'Share'], ['results', 'Results']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all',
              tab === id
                ? 'bg-brand-primary/20 border-brand-primary/40 text-white'
                : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'share' && (
        <>
          {game.status === 'draft' && (
            <p className="text-[11px] text-amber-400 font-bold ">Links are ready to share — viewers can grab cards once you start the game.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Viewer play link', link: playLink, key: 'play' },
              { label: 'OBS overlay link', link: overlayLink, key: 'overlay' },
            ].map((x) => (
              <div key={x.key} className="bento-card !rounded-2xl p-5">
                <p className="text-[10px] font-black  text-zinc-500 mb-2">{x.label}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-brand-primary/80 truncate bg-black/30 rounded-lg px-3 py-2">{x.link}</code>
                  <button onClick={() => copy(x.link, x.key)} className="saas-button-secondary text-xs shrink-0">
                    {copied === x.key ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* QR code for the viewer play link — point a phone camera at it to join */}
          <div className="bento-card !rounded-2xl p-5 flex items-center gap-5">
            <img src={qrSrc} alt="Play link QR" width={104} height={104} className="rounded-xl bg-white p-1.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-black  text-zinc-500">Scan to play</p>
              <p className="text-sm text-zinc-300 font-medium mt-1">
                Drop this on stream — viewers scan it, log in with Twitch, and get their card.
              </p>
              <button onClick={() => copy(playLink, 'qr')} className="saas-button-secondary text-xs mt-2">
                {copied === 'qr' ? 'Copied!' : 'Copy play link'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Pending submissions to review (manual mode) */}
      {tab === 'live' && game.reviewMode === 'manual' && <ClaimsReview game={game} onAction={onAction} />}

      {/* Recently called — newest first (the validation trail) */}
      {tab === 'live' && game.called.length > 0 && (
        <div className="bento-card !rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[10px] font-black  text-zinc-500">
              Recently called ({game.called.length})
            </p>
            {game.status === 'active' && (
              <button
                onClick={() => onAction(game.id, 'uncall', { tileId: game.called[game.called.length - 1] })}
                className="saas-button-secondary text-xs"
              >
                ↩ Undo last call
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {[...game.called].reverse().slice(0, 12).map((cid, i) => {
              const t = tileById.get(cid);
              return (
                <span
                  key={`${cid}-${i}`}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5',
                    i === 0
                      ? 'bg-brand-primary/25 border-brand-primary/50 text-white shadow-glow-p'
                      : 'bg-white/[0.03] border-white/10 text-zinc-300',
                  )}
                >
                  {t?.image && <img src={t.image} alt="" className="w-4 h-4 rounded object-cover" />}
                  {t?.label ?? cid}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Tile board — click to call */}
      {tab === 'live' && (
      <div className="bento-card p-8">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <h3 className="text-lg font-black text-white uppercase tracking-tight">
            {game.status === 'active' ? 'Tap a tile to call it' : 'Tiles'}
          </h3>
          {game.status === 'draft' && (
            <span className="text-[11px] text-amber-400 font-bold ">Start the game to call tiles</span>
          )}
          {game.status === 'active' && (
            <div className="flex items-center gap-3 flex-wrap">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tiles…"
                className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-brand-primary/50 w-40"
              />
              <button
                onClick={() => setAutoCall((v) => !v)}
                className={cn(
                  'px-4 py-2 rounded-xl text-[10px] font-black  border transition-all',
                  autoCall
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white',
                )}
              >
                {autoCall ? '■ Auto-call on' : '▶ Auto-call'}
              </button>
              <select
                value={autoSecs}
                onChange={(e) => setAutoSecs(Number(e.target.value))}
                className="void-select void-select-compact"
                title="Auto-call interval"
              >
                {[10, 15, 20, 30, 45, 60].map((s) => (
                  <option key={s} value={s}>{s}s</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {game.tiles
            .filter((t) => !search.trim() || (t.label || '').toLowerCase().includes(search.toLowerCase()))
            .map((tile) => {
            const calls = calledCounts[tile.id] || 0;
            const fully = calls >= tile.count;
            const partial = calls > 0 && !fully;
            return (
              <button
                key={tile.id}
                disabled={game.status !== 'active'}
                onClick={() => onAction(game.id, fully && tile.count === 1 ? 'uncall' : 'call', { tileId: tile.id })}
                onContextMenu={(e) => { e.preventDefault(); if (calls > 0) onAction(game.id, 'uncall', { tileId: tile.id }); }}
                title={tile.count > 1 ? `Called ${calls}/${tile.count} — right-click to undo` : 'Right-click to undo'}
                className={cn(
                  'relative rounded-2xl px-4 py-4 text-sm font-bold text-left transition-all border disabled:cursor-default overflow-hidden flex items-center gap-2',
                  fully
                    ? 'bg-brand-primary/20 border-brand-primary/40 text-white shadow-glow-p'
                    : partial
                      ? 'bg-amber-500/10 border-amber-500/30 text-white'
                      : 'bg-white/[0.03] border-white/10 text-zinc-300 hover:border-brand-primary/30 enabled:hover:bg-white/[0.06]',
                )}
              >
                {tile.image && <img src={tile.image} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />}
                <span className="min-w-0 truncate">{tile.label || tile.id}</span>
                {tile.count > 1 && (
                  <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded bg-black/40 shrink-0">{calls}/{tile.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* Winners */}
      {tab === 'live' && (
      <div className="bento-card p-8">
        <h3 className="text-lg font-black text-white uppercase tracking-tight mb-6">
          Winners {winners.length > 0 && <span className="text-brand-primary">({winners.length})</span>}
        </h3>
        {winners.length === 0 ? (
          <p className="text-zinc-600 text-sm font-medium">No bingo yet.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {winners.map((w, i) => (
              <div key={w.id} className="px-5 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-black">
                {i === 0 && '🏆 '}{w.name}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {tab === 'setup' && (
        <>
          {/* Board editor — tiles/size/pattern are locked once the game starts */}
          {game.status === 'draft' && <DraftBoardEditor game={game} onPatch={onPatch} />}

          {/* Game settings — prize, win-check mode, mark style (editable anytime) */}
          <GameSettings game={game} onPatch={onPatch} fonts={fonts} />

          {/* Entitlements — how many cards each viewer can hold */}
          <EntitlementsPanel game={game} onAction={onAction} onPatch={onPatch} />
        </>
      )}

      {tab === 'results' && (
        <>
          {/* Season leaderboard — points carry across games + rounds */}
          <Leaderboard refreshKey={winners.length} />

          {/* Winner history across all games */}
          <WinnerHistory refreshKey={winners.length} />
        </>
      )}
    </div>
  );
}

// ---- Draft-only board editor: tiles, size, free space, win pattern -----------
function DraftBoardEditor({ game, onPatch }: { game: Game; onPatch: (id: string, body: any) => Promise<void> }) {
  const [tilesText, setTilesText] = useState(tilesToText(game.tiles));
  const [imageTiles, setImageTiles] = useState(
    game.tiles.filter((t) => t.image).map((t) => ({ label: t.label || '', image: t.image!, count: t.count })),
  );
  const [size, setSize] = useState(game.size);
  const [freeSpace, setFreeSpace] = useState(game.freeSpace);
  const [winCondition, setWinCondition] = useState<WinPattern>(game.winCondition);
  const [saving, setSaving] = useState(false);

  const total = parseTiles(tilesText).length + imageTiles.filter((t) => t.image.trim()).length;
  const needed = size * size - (freeSpace && size % 2 === 1 ? 1 : 0);

  const save = async () => {
    setSaving(true);
    try {
      const tiles = [
        ...parseTiles(tilesText),
        ...imageTiles.filter((t) => t.image.trim()).map((t) => ({ label: t.label.trim(), image: t.image.trim(), count: Math.max(1, t.count) })),
      ];
      await onPatch(game.id, { tiles, size, freeSpace, winCondition });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bento-card p-8 space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-lg font-black text-white uppercase tracking-tight">Board</h3>
        <div className="flex items-center gap-3">
          <span className={cn('text-[11px] font-black ', total < needed ? 'text-amber-400' : 'text-zinc-500')}>
            {total}/{needed} tiles
          </span>
          <button onClick={save} disabled={saving} className="saas-button-secondary text-xs">{saving ? 'Saving…' : 'Save board'}</button>
        </div>
      </div>

      <div className="flex gap-4 flex-wrap items-end">
        <div className="space-y-2">
          <label className="text-[10px] font-black  text-zinc-500">Board size</label>
          <select value={size} onChange={(e) => setSize(Number(e.target.value))} className="void-select void-select-compact">
            {[3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} × {n}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black  text-zinc-500">Win pattern</label>
          <select value={winCondition} onChange={(e) => setWinCondition(e.target.value as WinPattern)} className="void-select void-select-compact">
            {PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-3 cursor-pointer pb-2.5">
          <input type="checkbox" checked={freeSpace} onChange={(e) => setFreeSpace(e.target.checked)} className="accent-brand-primary w-4 h-4" />
          <span className="text-sm text-zinc-300 font-medium">Free space (odd boards)</span>
        </label>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black  text-zinc-500">Tiles — one per line</label>
        <textarea
          value={tilesText}
          onChange={(e) => setTilesText(e.target.value)}
          rows={9}
          className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:border-brand-primary/50 outline-none resize-y font-mono"
        />
        <p className="text-[10px] text-zinc-600">Add <span className="text-brand-primary">×3</span> after a tile for multi-check. Tiles lock once the game starts.</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black  text-zinc-500">Image tiles ({imageTiles.length})</label>
          <button type="button" onClick={() => setImageTiles((p) => [...p, { label: '', image: '', count: 1 }])} className="text-brand-primary text-[10px] font-black  hover:underline">+ Add image</button>
        </div>
        {imageTiles.map((t, i) => (
          <div key={i} className="flex gap-2 items-center">
            {t.image
              ? <img src={t.image} alt="" className="w-9 h-9 rounded-lg object-cover bg-black/30 shrink-0" />
              : <label className="w-9 h-9 rounded-lg bg-white/[0.04] border border-dashed border-white/15 shrink-0 flex items-center justify-center cursor-pointer text-zinc-500 hover:text-white text-lg">
                  +<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const url = await uploadImage(f); if (url) setImageTiles((p) => p.map((x, j) => (j === i ? { ...x, image: url } : x))); } }} />
                </label>}
            <input value={t.image} onChange={(e) => setImageTiles((p) => p.map((x, j) => (j === i ? { ...x, image: e.target.value } : x)))} placeholder="Image URL or upload →" className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none" />
            <input value={t.label} onChange={(e) => setImageTiles((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label" className="w-24 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none" />
            <input type="number" min={1} max={9} value={t.count} onChange={(e) => setImageTiles((p) => p.map((x, j) => (j === i ? { ...x, count: Math.max(1, Number(e.target.value) || 1) } : x)))} className="w-14 bg-white/[0.03] border border-white/10 rounded-xl px-2 py-2 text-white text-xs outline-none" title="checks needed" />
            <button type="button" onClick={() => setImageTiles((p) => p.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-rose-400 px-1"><svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function GameSettings({ game, onPatch, fonts }: { game: Game; onPatch: (id: string, body: any) => Promise<void>; fonts: Font[] }) {
  const [reward, setReward] = useState(game.reward ?? '');
  const [reviewMode, setReviewMode] = useState<'auto' | 'manual'>(game.reviewMode ?? 'auto');
  const style = game.cardStyle ?? {};
  const [markColor, setMarkColor] = useState(style.markColor ?? '#9333ea');
  const [markStyle, setMarkStyle] = useState<NonNullable<CardStyle['markStyle']>>(style.markStyle ?? 'cross');
  const [tileFont, setTileFont] = useState(style.tileFont ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReward(game.reward ?? '');
    setReviewMode(game.reviewMode ?? 'auto');
    setMarkColor(game.cardStyle?.markColor ?? '#9333ea');
    setMarkStyle(game.cardStyle?.markStyle ?? 'cross');
    setTileFont(game.cardStyle?.tileFont ?? '');
  }, [game.id, game.reward, game.reviewMode, game.cardStyle]);

  const save = async () => {
    setSaving(true);
    try {
      const tileFontUrl = fonts.find((f) => f.family === tileFont)?.url;
      await onPatch(game.id, { reward: reward.trim() || null, reviewMode, cardStyle: { ...style, markColor, markStyle, tileFont, tileFontUrl } });
    } finally { setSaving(false); }
  };

  return (
    <div className="bento-card p-8 space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-lg font-black text-white uppercase tracking-tight">Game settings</h3>
        <button onClick={save} disabled={saving} className="saas-button-secondary text-xs">{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-black  text-zinc-500">Prize</label>
        <input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Shown to players + on the overlay" className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-brand-primary/50" />
      </div>
      <div className="flex gap-4 flex-wrap items-end">
        <div className="space-y-2 flex-1 min-w-[150px]">
          <label className="text-[10px] font-black  text-zinc-500">Win check</label>
          <select value={reviewMode} onChange={(e) => setReviewMode(e.target.value as any)} className="void-select">
            <option value="auto">Auto-validate (instant)</option>
            <option value="manual">I review submissions</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black  text-zinc-500">Mark</label>
          <div className="flex items-center gap-2">
            <input type="color" value={markColor} onChange={(e) => setMarkColor(e.target.value)} className="w-10 h-10 rounded-lg bg-transparent border border-white/10 cursor-pointer" />
            <select value={markStyle} onChange={(e) => setMarkStyle(e.target.value as any)} className="void-select void-select-compact">
              {MARK_STYLES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black  text-zinc-500">Tile font</label>
          <select value={tileFont} onChange={(e) => setTileFont(e.target.value)} className="void-select void-select-compact">
            {TILE_FONTS.map((f) => <option key={f} value={f}>{f || 'Default'}</option>)}
            {fonts.map((f) => <option key={f.id} value={f.family}>{f.name} (yours)</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

function ClaimsReview({ game, onAction }: { game: Game; onAction: (id: string, path: string, body?: any) => void }) {
  const [claims, setClaims] = useState<{ id: string; name: string; cells: string[]; marks: Record<string, number>; cardNumber: number }[]>([]);
  const tileById = new Map(game.tiles.map((t) => [t.id, t]));

  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE}/games/${game.id}/claims`, { credentials: 'include' });
    if (res.ok) setClaims((await res.json()).claims || []);
  }, [game.id]);
  useEffect(() => { load(); }, [load, game.called.length]);

  const act = async (cardId: string, what: 'approve' | 'deny') => {
    setClaims((p) => p.filter((c) => c.id !== cardId)); // optimistic
    onAction(game.id, `claims/${cardId}/${what}`);
  };

  if (claims.length === 0) return null;
  return (
    <div className="bento-card p-8 !border-amber-400/20">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-black text-white uppercase tracking-tight">Review submissions <span className="text-amber-400">({claims.length})</span></h3>
        <button onClick={load} className="saas-button-secondary text-xs">Refresh</button>
      </div>
      <div className="space-y-5">
        {claims.map((c) => (
          <div key={c.id} className="rounded-2xl border border-white/10 p-5 bg-white/[0.02]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="font-black text-white">{c.name} <span className="text-zinc-500 text-xs">· card {c.cardNumber}</span></span>
              <div className="flex gap-2">
                <button onClick={() => act(c.id, 'approve')} className="saas-button text-xs">Approve</button>
                <button onClick={() => act(c.id, 'deny')} className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-black ">Deny</button>
              </div>
            </div>
            <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${game.size}, minmax(0, 1fr))` }}>
              {c.cells.map((cid, i) => {
                const t = tileById.get(cid);
                const need = t?.count ?? 1;
                const crossed = cid === 'FREE' || Number(c.marks[String(i)] ?? 0) >= need;
                return (
                  <div key={i} className={cn('w-9 h-9 rounded flex items-center justify-center text-[7px] text-center leading-none p-0.5 overflow-hidden border', crossed ? 'bg-purple-600 border-purple-400 text-white' : 'bg-white/[0.03] border-white/10 text-zinc-500')} title={t?.label || cid}>
                    {t?.image ? <img src={t.image} alt="" className="w-full h-full object-cover rounded" /> : (cid === 'FREE' ? '★' : (t?.label || cid).slice(0, 6))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatCommandToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE}/chat-command`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setEnabled(!!d.enabled))
      .catch(() => setEnabled(false));
  }, []);
  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/chat-command/${enabled ? 'disable' : 'enable'}`, { method: 'POST', credentials: 'include' });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Failed — reconnect Twitch (chat scope) first'); return; }
      setEnabled(!enabled);
      if (d.eventSubActive === false) alert('Enabled, but Twitch could not reach the webhook yet. It activates once the worker is deployed with a public URL, and after re-authenticating Twitch (new chat scope).');
    } finally { setBusy(false); }
  };
  if (enabled === null) return null;
  return (
    <div className="bento-card !rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p className="text-sm font-black text-white"><code className="text-brand-primary">!bingo</code> chat command {enabled && <span className="text-emerald-400 text-xs">· on</span>}</p>
        <p className="text-zinc-500 text-xs mt-0.5">Viewers type <span className="text-zinc-300">!bingo</span> to be dealt a card for the active game (one per account).</p>
      </div>
      <button onClick={toggle} disabled={busy} className={enabled ? 'saas-button-secondary text-xs' : 'saas-button text-xs'}>
        {busy ? '…' : enabled ? 'Disable' : 'Enable'}
      </button>
    </div>
  );
}

function FontManager({ fonts, onChange }: { fonts: Font[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    const name = prompt('Name this font:', file.name.replace(/\.[^.]+$/, '')) || file.name;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', name);
      const res = await fetch(apiUrl('/api/fonts'), { method: 'POST', credentials: 'include', body: fd });
      if (!res.ok) alert((await res.json().catch(() => ({}))).error || 'Upload failed');
      onChange();
    } finally { setBusy(false); }
  };
  const del = async (id: string) => {
    await fetch(apiUrl(`/api/fonts/${id}`), { method: 'DELETE', credentials: 'include' });
    onChange();
  };
  return (
    <div className="space-y-2 border-t border-white/5 pt-4">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-black  text-zinc-500">My fonts ({fonts.length}/5)</label>
        {fonts.length < 5 && (
          <label className="text-brand-primary text-[10px] font-black  hover:underline cursor-pointer">
            {busy ? 'Uploading…' : '+ Upload .ttf'}
            <input type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {fonts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fonts.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-zinc-300" style={{ fontFamily: `'${f.family}', sans-serif` }}>
              {f.name}
              <button onClick={() => del(f.id)} className="text-zinc-600 hover:text-rose-400"><svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function WinnerHistory({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<{ id: string; name: string; game: string; at: string }[]>([]);
  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE}/history`, { credentials: 'include' });
    if (res.ok) setRows((await res.json()).history || []);
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (rows.length === 0) return null;
  return (
    <div className="bento-card p-8">
      <h3 className="text-lg font-black text-white uppercase tracking-tight mb-5">Winner history</h3>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-sm">
            <span className="font-black text-white">🏆 {r.name}</span>
            <span className="text-zinc-500 truncate">{r.game}</span>
            <span className="ml-auto text-[11px] text-zinc-600 shrink-0">{r.at ? new Date(r.at).toLocaleDateString() : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Leaderboard({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<{ rank: number; name: string; points: number; wins: number; plays: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE}/leaderboard`, { credentials: 'include' });
    if (res.ok) setRows((await res.json()).leaderboard || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const reset = async () => {
    if (!confirm('Reset the leaderboard for a new season? This permanently clears all points.')) return;
    await fetch(`${API_BASE}/leaderboard/reset`, { method: 'POST', credentials: 'include' });
    load();
  };

  return (
    <div className="bento-card p-8">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <h3 className="text-lg font-black text-white uppercase tracking-tight">Season leaderboard</h3>
        <div className="flex items-center gap-2">
          <button onClick={load} className="saas-button-secondary text-xs">Refresh</button>
          {rows.length > 0 && (
            <button onClick={reset} className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-black  hover:bg-rose-500/20 transition-all">
              Reset season
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <p className="text-zinc-600 text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-zinc-600 text-sm font-medium">No points yet — play a game to start the board.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.rank}
              className={cn(
                'flex items-center gap-4 px-4 py-3 rounded-2xl border',
                r.rank === 1
                  ? 'bg-amber-400/10 border-amber-400/30'
                  : r.rank <= 3
                    ? 'bg-white/[0.04] border-white/10'
                    : 'bg-white/[0.02] border-white/5',
              )}
            >
              <span className="w-8 text-center font-black text-sm">
                {r.rank === 1 ? <span className="text-yellow-400 text-xs">1st</span> : r.rank === 2 ? <span className="text-zinc-300 text-xs">2nd</span> : r.rank === 3 ? <span className="text-orange-400 text-xs">3rd</span> : <span className="text-zinc-600">{r.rank}</span>}
              </span>
              <span className="flex-1 font-black text-white truncate">{r.name}</span>
              <span className="text-[11px] text-zinc-500 font-bold  hidden sm:block">
                {r.wins}W · {r.plays} played
              </span>
              <span className="text-brand-primary font-black tabular-nums">{r.points}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DEFAULT_ENT: Entitlements = {
  base: 1,
  allowMultiple: false,
  subTierCards: { '1000': 0, '2000': 0, '3000': 0 },
  channelPoints: { enabled: false, rewardId: null, cost: 500, cardsPerRedemption: 1, maxPerUser: 5 },
};

function EntitlementsPanel({
  game,
  onAction,
  onPatch,
}: {
  game: Game;
  onAction: (id: string, path: string, body?: any) => void;
  onPatch: (id: string, body: any) => Promise<void>;
}) {
  const [ent, setEnt] = useState<Entitlements>({ ...DEFAULT_ENT, ...(game.entitlements || {}) });
  const [saving, setSaving] = useState(false);
  const cp = ent.channelPoints;

  // Keep local form in sync when the selected game changes / server updates.
  useEffect(() => {
    setEnt({ ...DEFAULT_ENT, ...(game.entitlements || {}) });
  }, [game.id, game.entitlements]);

  const save = async () => {
    setSaving(true);
    try {
      await onPatch(game.id, {
        entitlements: { base: ent.base, allowMultiple: ent.allowMultiple, subTierCards: ent.subTierCards },
      });
    } finally {
      setSaving(false);
    }
  };

  const num = (v: string) => Math.max(0, Number(v) || 0);

  return (
    <div className="bento-card p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-lg font-black text-white uppercase tracking-tight">Cards per viewer</h3>
        <button onClick={save} disabled={saving} className="saas-button-secondary text-xs">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className="text-zinc-500 text-sm -mt-2">
        Viewers log in with Twitch and get <strong>{ent.base}</strong> card{ent.base === 1 ? '' : 's'} by default.
      </p>

      <div className="flex flex-wrap gap-6 items-end">
        <div className="space-y-2">
          <label className="text-[10px] font-black  text-zinc-500">Base cards</label>
          <input
            type="number" min={1}
            value={ent.base}
            onChange={(e) => setEnt({ ...ent, base: Math.max(1, num(e.target.value)) })}
            className="w-24 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none"
          />
        </div>
        <label className="flex items-center gap-3 cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={ent.allowMultiple}
            onChange={(e) => setEnt({ ...ent, allowMultiple: e.target.checked })}
            className="accent-brand-primary w-4 h-4"
          />
          <span className="text-sm text-zinc-300 font-medium">Allow more than the base (sub tiers / channel points)</span>
        </label>
      </div>

      {ent.allowMultiple && (
        <>
          <div className="space-y-3">
            <p className="text-[10px] font-black  text-zinc-500">Bonus cards by sub tier</p>
            <div className="flex gap-4">
              {(['1000', '2000', '3000'] as const).map((tier, i) => (
                <div key={tier} className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500">Tier {i + 1}</label>
                  <input
                    type="number" min={0}
                    value={ent.subTierCards[tier] ?? 0}
                    onChange={(e) => setEnt({ ...ent, subTierCards: { ...ent.subTierCards, [tier]: num(e.target.value) } })}
                    className="w-20 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Channel points — managed via enable/disable (creates a Twitch reward + EventSub) */}
          <div className="border-t border-white/5 pt-5 space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-[10px] font-black  text-zinc-500">
                Channel-point purchases {cp.enabled && <span className="text-emerald-400">· live</span>}
              </p>
              {cp.enabled ? (
                <button onClick={() => onAction(game.id, 'channel-points/disable')} className="saas-button-secondary text-xs">
                  Disable reward
                </button>
              ) : (
                <button
                  onClick={() => onAction(game.id, 'channel-points/enable', { cost: cp.cost, cardsPerRedemption: cp.cardsPerRedemption, maxPerUser: cp.maxPerUser })}
                  className="saas-button text-xs"
                >
                  Create channel-point reward
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              {([
                ['Cost (points)', 'cost'],
                ['Cards / redemption', 'cardsPerRedemption'],
                ['Max per viewer', 'maxPerUser'],
              ] as const).map(([label, key]) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500">{label}</label>
                  <input
                    type="number" min={1}
                    disabled={cp.enabled}
                    value={(cp as any)[key]}
                    onChange={(e) => setEnt({ ...ent, channelPoints: { ...cp, [key]: Math.max(1, num(e.target.value)) } })}
                    className="w-28 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none disabled:opacity-50"
                  />
                </div>
              ))}
            </div>
            <p className="text-zinc-600 text-[11px]">
              Creating the reward needs Twitch reconnected with reward permissions. Redemptions only grant cards once the worker is reachable by Twitch (deployed).
            </p>
          </div>
        </>
      )}
    </div>
  );
}

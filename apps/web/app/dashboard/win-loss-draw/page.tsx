"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Swords } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { connectRealtime } from '@/lib/realtime';
import Scoreboard, { type WldBoard, type WldConfig } from '@/components/wld/Scoreboard';
import { VoidSelect } from '@/components/dashboard/VoidSelect';
import { FeatureHeader } from '@/components/dashboard/FeatureUI';

const API_BASE = apiUrl('/api/integrations/win-loss-draw');

const FONTS = ['Inter', 'Montserrat', 'Oswald', 'Bebas Neue', 'Poppins', 'Rajdhani', 'Teko', 'Russo One', 'Archivo Black', 'Anton'];

function isObj(v: any): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function deepMerge<T extends Record<string, any>>(base: T, override: any): T {
  if (!isObj(override)) return base;
  const out: Record<string, any> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export default function WinLossDrawPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [boards, setBoards] = useState<WldBoard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('Scoreboard');
  const [creating, setCreating] = useState(false);

  const selected = boards.find((b) => b.id === selectedId) || null;

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(API_BASE, { credentials: 'include' });
      setEnabled(res.ok ? Boolean((await res.json()).enabled) : false);
    } catch {
      setEnabled(false);
    }
  }, []);

  const loadBoards = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/boards`, { credentials: 'include' });
      const data = await res.json();
      setBoards(data.boards || []);
    } catch (e) {
      console.error('Failed to load boards', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadBoards();
  }, [loadStatus, loadBoards]);

  const createBoard = async () => {
    setCreating(true);
    try {
      if (!enabled) {
        await fetch(`${API_BASE}/enable`, { method: 'POST', credentials: 'include' });
        setEnabled(true);
      }
      const res = await fetch(`${API_BASE}/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (res.ok) {
        setBoards((prev) => [data.board, ...prev]);
        setSelectedId(data.board.id);
        setTitle('Scoreboard');
      } else {
        alert(data.error || 'Failed to create');
      }
    } finally {
      setCreating(false);
    }
  };

  const deleteBoard = async (id: string) => {
    if (!confirm('Delete this scoreboard?')) return;
    await fetch(`${API_BASE}/boards/${id}`, { method: 'DELETE', credentials: 'include' });
    setBoards((prev) => prev.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const onBoardChange = (b: WldBoard) => setBoards((prev) => prev.map((x) => (x.id === b.id ? b : x)));

  if (loading) {
    return (
      <div className="py-40 flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin shadow-glow-p" />
        <p className="text-brand-primary/40 font-black  text-[10px]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <FeatureHeader
        icon={Swords}
        title="Win / Loss / Draw"
        subtitle="A fully customizable session record overlay for OBS."
      >
        {selected && <button onClick={() => setSelectedId(null)} className="saas-button-secondary">← All boards</button>}
      </FeatureHeader>

      {selected ? (
        <ManageBoard key={selected.id} initial={selected} onChange={onBoardChange} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bento-card p-8 space-y-5">
            <h2 className="text-lg font-black text-white uppercase tracking-tight">New scoreboard</h2>
            <div className="space-y-2">
              <label className="text-[10px] font-black  text-zinc-500">Name</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:border-brand-primary/50 outline-none"
              />
            </div>
            <button onClick={createBoard} disabled={creating} className="saas-button w-full">
              {creating ? 'Creating…' : 'Create scoreboard'}
            </button>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-black text-white uppercase tracking-tight">Your scoreboards</h2>
            {boards.length === 0 ? (
              <div className="bento-card py-20 text-center text-zinc-600 font-black  text-[11px]">No scoreboards yet</div>
            ) : (
              boards.map((b) => (
                <div key={b.id} className="bento-card p-6 flex items-center justify-between gap-4 hover:border-brand-primary/30 transition-all">
                  <div className="min-w-0">
                    <h3 className="font-black text-white truncate">{b.title}</h3>
                    <p className="text-[11px] text-zinc-500 font-bold  mt-1">{b.wins}W · {b.losses}L · {b.draws}D</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setSelectedId(b.id)} className="saas-button-secondary text-xs">Open</button>
                    <button onClick={() => deleteBoard(b.id)} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-zinc-600 hover:text-rose-400 hover:bg-rose-400/10 transition-all cursor-pointer" title="Delete"><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
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

function ManageBoard({ initial, onChange }: { initial: WldBoard; onChange: (b: WldBoard) => void }) {
  const [board, setBoard] = useState<WldBoard>(initial);
  const [copied, setCopied] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const overlayLink = `${origin}/overlay/wld/${board.id}`;
  const cfg = board.config;

  // Keep in sync if another tab/mod changes it.
  useEffect(() => {
    return connectRealtime(`wld:${board.id}`, (event, data) => {
      if (event === 'wld.update' && data?.id === board.id) {
        setBoard(data as WldBoard);
        onChange(data as WldBoard);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id]);

  const adjust = async (field: 'wins' | 'losses' | 'draws', delta: number) => {
    setBoard((b) => ({ ...b, [field]: Math.max(0, b[field] + delta) })); // optimistic
    const res = await fetch(`${API_BASE}/boards/${board.id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ field, delta }),
    });
    if (res.ok) {
      const data = await res.json();
      setBoard(data.board);
      onChange(data.board);
    }
  };

  const reset = async () => {
    const res = await fetch(`${API_BASE}/boards/${board.id}/reset`, { method: 'POST', credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setBoard(data.board);
      onChange(data.board);
    }
  };

  // Update style config: optimistic local merge + debounced save (full config).
  const setConfig = (partial: any) => {
    setBoard((b) => {
      const config = deepMerge(b.config, partial);
      const next = { ...b, config };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch(`${API_BASE}/boards/${board.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ config }),
        }).then(() => onChange(next));
      }, 350);
      return next;
    });
  };

  const copy = () => {
    navigator.clipboard.writeText(overlayLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-8">
      <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${cfg.font.family.replace(/\s+/g, '+')}:wght@400;700;800;900&display=swap`} />

      {/* Preview + counts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          {/* checkerboard = transparent preview */}
          <div
            className="rounded-[2rem] p-10 flex items-center justify-center min-h-[260px] border border-white/10"
            style={{
              backgroundColor: '#222',
              backgroundImage:
                'linear-gradient(45deg, #2a2a2a 25%, transparent 25%), linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2a 75%), linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)',
              backgroundSize: '24px 24px',
              backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
            }}
          >
            <Scoreboard board={board} />
          </div>

          <div className="bento-card p-6">
            <div className="grid grid-cols-3 gap-4">
              {([
                { field: 'wins', label: 'Wins', color: cfg.colors.win },
                { field: 'losses', label: 'Losses', color: cfg.colors.loss },
                { field: 'draws', label: 'Draws', color: cfg.colors.draw },
              ] as const).map((s) => (
                <div key={s.field} className="flex flex-col items-center gap-3">
                  <span className="text-[10px] font-black  text-zinc-500">{s.label}</span>
                  <span className="text-4xl font-black" style={{ color: s.color }}>{board[s.field]}</span>
                  <div className="flex gap-2">
                    <button onClick={() => adjust(s.field, -1)} className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 text-white font-black hover:bg-white/[0.08]">−</button>
                    <button onClick={() => adjust(s.field, 1)} className="w-10 h-10 rounded-xl bg-brand-primary/20 border border-brand-primary/40 text-white font-black hover:bg-brand-primary/30">+</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={reset} className="saas-button-secondary w-full mt-6">Reset all</button>
          </div>

          <div className="bento-card !rounded-2xl p-5">
            <p className="text-[10px] font-black  text-zinc-500 mb-2">OBS overlay link</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-brand-primary/80 truncate bg-black/30 rounded-lg px-3 py-2">{overlayLink}</code>
              <button onClick={copy} className="saas-button-secondary text-xs shrink-0">{copied ? 'Copied!' : 'Copy'}</button>
            </div>
          </div>
        </div>

        {/* Customization */}
        <div className="space-y-6">
          <Section title="Content">
            <SelectField label="Layout" value={cfg.layout} options={['horizontal', 'vertical']} onChange={(v) => setConfig({ layout: v })} />
            <Toggle label="Show draws" checked={cfg.showDraws} onChange={(v) => setConfig({ showDraws: v })} />
            <Toggle label="Show labels" checked={cfg.showLabels} onChange={(v) => setConfig({ showLabels: v })} />
            <Toggle label="Show title" checked={cfg.showTitle} onChange={(v) => setConfig({ showTitle: v })} />
            <TextField label="Title" value={cfg.title} onChange={(v) => setConfig({ title: v })} />
            <div className="grid grid-cols-3 gap-3">
              <TextField label="Win label" value={cfg.labels.win} onChange={(v) => setConfig({ labels: { win: v } })} />
              <TextField label="Loss label" value={cfg.labels.loss} onChange={(v) => setConfig({ labels: { loss: v } })} />
              <TextField label="Draw label" value={cfg.labels.draw} onChange={(v) => setConfig({ labels: { draw: v } })} />
            </div>
            <TextField label="Separator (e.g.  -  )" value={cfg.separator} onChange={(v) => setConfig({ separator: v })} />
          </Section>

          <Section title="Colors">
            <div className="grid grid-cols-2 gap-3">
              <ColorField label="Win" value={cfg.colors.win} onChange={(v) => setConfig({ colors: { win: v } })} />
              <ColorField label="Loss" value={cfg.colors.loss} onChange={(v) => setConfig({ colors: { loss: v } })} />
              <ColorField label="Draw" value={cfg.colors.draw} onChange={(v) => setConfig({ colors: { draw: v } })} />
              <ColorField label="Labels" value={cfg.colors.text} onChange={(v) => setConfig({ colors: { text: v } })} />
              <ColorField label="Title" value={cfg.colors.title} onChange={(v) => setConfig({ colors: { title: v } })} />
              <ColorField label="Background" value={cfg.colors.background} onChange={(v) => setConfig({ colors: { background: v } })} />
            </div>
            <Slider label="Background opacity" min={0} max={1} step={0.05} value={cfg.box.backgroundOpacity} onChange={(v) => setConfig({ box: { backgroundOpacity: v } })} />
          </Section>

          <Section title="Typography">
            <SelectField label="Font" value={cfg.font.family} options={FONTS} onChange={(v) => setConfig({ font: { family: v } })} />
            <Slider label="Size" min={20} max={140} step={2} value={cfg.font.size} onChange={(v) => setConfig({ font: { size: v } })} />
            <Slider label="Weight" min={400} max={900} step={100} value={cfg.font.weight} onChange={(v) => setConfig({ font: { weight: v } })} />
            <Slider label="Letter spacing" min={-4} max={12} step={1} value={cfg.font.letterSpacing} onChange={(v) => setConfig({ font: { letterSpacing: v } })} />
            <Toggle label="Uppercase" checked={cfg.font.uppercase} onChange={(v) => setConfig({ font: { uppercase: v } })} />
          </Section>

          <Section title="Box">
            <Slider label="Corner radius" min={0} max={60} step={2} value={cfg.box.radius} onChange={(v) => setConfig({ box: { radius: v } })} />
            <Slider label="Padding" min={0} max={64} step={2} value={cfg.box.padding} onChange={(v) => setConfig({ box: { padding: v } })} />
            <Slider label="Gap" min={0} max={80} step={2} value={cfg.box.gap} onChange={(v) => setConfig({ box: { gap: v } })} />
            <Slider label="Border width" min={0} max={8} step={1} value={cfg.box.borderWidth} onChange={(v) => setConfig({ box: { borderWidth: v } })} />
            <ColorField label="Border color" value={cfg.box.borderColor} onChange={(v) => setConfig({ box: { borderColor: v } })} />
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ---- small control primitives ---- */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bento-card p-6 space-y-4">
      <h3 className="text-sm font-black text-white uppercase tracking-tight">{title}</h3>
      {children}
    </div>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm text-zinc-300 font-medium">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-12 h-6 rounded-full p-1 transition-all border border-white/10 ${checked ? 'bg-brand-primary' : 'bg-zinc-800'}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'translate-x-6' : ''}`} />
      </button>
    </label>
  );
}
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black  text-zinc-500">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-brand-primary/50" />
    </div>
  );
}
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black  text-zinc-500">{label}</label>
      <VoidSelect value={value} onChange={(e) => onChange(e.target.value)} className="capitalize">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </VoidSelect>
    </div>
  );
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black  text-zinc-500">{label}</label>
      <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-xl px-2 py-1.5">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 bg-transparent text-white text-xs outline-none font-mono" />
      </div>
    </div>
  );
}
function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between">
        <label className="text-[10px] font-black  text-zinc-500">{label}</label>
        <span className="text-[10px] font-black text-brand-primary">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-brand-primary" />
    </div>
  );
}

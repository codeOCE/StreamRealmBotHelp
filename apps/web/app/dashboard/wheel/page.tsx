"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Copy, Disc3, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { FeatureHeader } from '@/components/dashboard/FeatureUI';
import Wheel, {
  segmentArcs,
  spinToAngle,
  spinDuration,
  spinExtraTurns,
  wheelSizePx,
  styleFromConfig,
  segmentColor,
  PALETTE,
  DEFAULT_WHEEL_CONFIG,
  type WheelSegment,
  type WheelConfig,
  type PointerStyle,
} from '@/components/wheel/Wheel';

const API_BASE = apiUrl('/api/integrations/wheel-spin');
const MAX_WHEELS = 5;

interface WheelGame {
  id: string;
  title: string;
  segments: WheelSegment[];
  /** Creator-authored snapshot; segments shrink on remove-on-select spins. */
  baseSegments?: WheelSegment[];
  config: WheelConfig;
}

interface SavedPalette {
  name: string;
  colors: string[];
}

const MAX_SAVED_PALETTES = 12;

const PRESET_PALETTES: SavedPalette[] = [
  { name: 'Classic', colors: PALETTE },
  { name: 'Royal', colors: ['#facc15', '#a855f7', '#6d28d9', '#f59e0b', '#312e81', '#c026d3'] },
  { name: 'Neon', colors: ['#00f5d4', '#f15bb5', '#fee440', '#00bbf9', '#9b5de5'] },
  { name: 'Pastel', colors: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff'] },
  { name: 'Sunset', colors: ['#f94144', '#f3722c', '#f8961e', '#f9c74f', '#90be6d', '#43aa8b', '#577590'] },
  { name: 'Midnight', colors: ['#1e293b', '#334155', '#0f766e', '#155e75', '#3730a3', '#581c87'] },
];
interface Spin {
  id: string;
  result: string;
  segment_index: number;
  created_at: string;
}

// ---- shared upload helper ----------------------------------------------------
async function uploadAsset(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', credentials: 'include', body: fd });
  if (!res.ok) return null;
  return (await res.json()).url ?? null;
}

export default function WheelPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [wheels, setWheels] = useState<WheelGame[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [spins, setSpins] = useState<Spin[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedPalettes, setSavedPalettes] = useState<SavedPalette[]>([]);

  // create form
  const [title, setTitle] = useState('Wheel');
  const [mode, setMode] = useState<'names' | 'values'>('names');
  const [labelsText, setLabelsText] = useState('');
  const [valuesText, setValuesText] = useState('');
  const [creating, setCreating] = useState(false);

  const selected = wheels.find((w) => w.id === selectedId) || null;

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(API_BASE, { credentials: 'include' });
      if (!res.ok) {
        setEnabled(false);
        return;
      }
      const data = await res.json();
      setEnabled(Boolean(data.enabled));
      const pals = Array.isArray(data.config?.palettes) ? data.config.palettes : [];
      setSavedPalettes(
        pals.filter((p: any) => p && typeof p.name === 'string' && Array.isArray(p.colors)).slice(0, MAX_SAVED_PALETTES),
      );
    } catch {
      setEnabled(false);
    }
  }, []);

  // Saved palettes live in the integration config (bot.tenants.settings).
  const savePalettes = useCallback(async (next: SavedPalette[]) => {
    setSavedPalettes(next);
    await fetch(`${API_BASE}/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ config: { palettes: next } }),
    }).catch(() => undefined);
  }, []);

  const loadWheels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/wheels`, { credentials: 'include' });
      const data = await res.json();
      setWheels(data.wheels || []);
    } catch (e) {
      console.error('Failed to load wheels', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`${API_BASE}/wheels/${id}`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    setSpins(data.spins || []);
    setWheels((prev) => prev.map((w) => (w.id === id ? data.wheel : w)));
  }, []);

  useEffect(() => {
    loadStatus();
    loadWheels();
  }, [loadStatus, loadWheels]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const createWheel = async () => {
    setCreating(true);
    try {
      if (!enabled) {
        await fetch(`${API_BASE}/enable`, { method: 'POST', credentials: 'include' });
        setEnabled(true);
      }
      let segments: WheelSegment[] = [];
      if (mode === 'names') {
        const labels = labelsText.split('\n').map((l) => l.trim()).filter(Boolean);
        segments = labels.map((label, i) => ({ label, color: PALETTE[i % PALETTE.length] }));
      } else {
        const vals = valuesText.split(/[,\n]/).map((v) => Number(v.trim())).filter((n) => Number.isFinite(n) && n > 0);
        segments = vals.map((weight, i) => ({ label: String(weight), weight, color: PALETTE[i % PALETTE.length] }));
      }
      const res = await fetch(`${API_BASE}/wheels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title, segments, config: DEFAULT_WHEEL_CONFIG }),
      });
      const data = await res.json();
      if (res.ok) {
        setWheels((prev) => [data.wheel, ...prev]);
        setSelectedId(data.wheel.id);
        setLabelsText('');
        setValuesText('');
        setTitle('Wheel');
      } else {
        alert(data.error || 'Failed to create wheel');
      }
    } finally {
      setCreating(false);
    }
  };

  const duplicateWheel = async (w: WheelGame) => {
    const res = await fetch(`${API_BASE}/wheels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title: `${w.title} copy`.slice(0, 80), segments: w.segments, config: w.config }),
    });
    const data = await res.json();
    if (res.ok) setWheels((prev) => [data.wheel, ...prev]);
    else alert(data.error || 'Failed to duplicate wheel');
  };

  const deleteWheel = async (id: string) => {
    if (!confirm('Delete this wheel?')) return;
    await fetch(`${API_BASE}/wheels/${id}`, { method: 'DELETE', credentials: 'include' });
    setWheels((prev) => prev.filter((w) => w.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  if (loading) {
    return (
      <div className="py-40 flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin shadow-glow-p" />
        <p className="text-brand-primary/40 font-black  text-[10px]">Loading wheels…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <FeatureHeader
        icon={Disc3}
        title="Wheel Spin"
        subtitle="Build a fully customizable prize wheel and spin it live on stream."
      >
        {selected && (
          <button onClick={() => setSelectedId(null)} className="saas-button-secondary">← All wheels</button>
        )}
      </FeatureHeader>

      {selected ? (
        <ManageWheel
          key={selected.id}
          wheel={selected}
          spins={spins}
          palettes={savedPalettes}
          onPalettesChange={savePalettes}
          onSaved={(w) => setWheels((prev) => prev.map((x) => (x.id === w.id ? w : x)))}
          onSpun={() => loadDetail(selected.id)}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bento-card p-8 space-y-5">
            <h2 className="text-lg font-black text-white uppercase tracking-tight">New wheel</h2>
            <div className="space-y-2">
              <label className="text-[10px] font-black  text-zinc-500">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:border-brand-primary/50 outline-none"
              />
            </div>

            <div className="flex gap-2">
              {(['names', 'values'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-[10px] font-black  border transition-all',
                    mode === m ? 'bg-brand-primary/20 border-brand-primary/40 text-white' : 'bg-white/[0.03] border-white/10 text-zinc-400',
                  )}
                >
                  {m === 'names' ? 'By names' : 'By values'}
                </button>
              ))}
            </div>

            {mode === 'names' ? (
              <div className="space-y-2">
                <label className="text-[10px] font-black  text-zinc-500">
                  Segments — one per line ({labelsText.split('\n').filter((l) => l.trim()).length})
                </label>
                <textarea
                  value={labelsText}
                  onChange={(e) => setLabelsText(e.target.value)}
                  rows={8}
                  placeholder={'1000 points\nVIP shoutout\nNothing 😈\nPick my next game\n…'}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:border-brand-primary/50 outline-none resize-y"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-[10px] font-black  text-zinc-500">
                  Slice values — bigger number = bigger slice
                </label>
                <input
                  value={valuesText}
                  onChange={(e) => setValuesText(e.target.value)}
                  placeholder="10, 30, 30, 30, 50, 50"
                  className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:border-brand-primary/50 outline-none"
                />
                <p className="text-[10px] text-zinc-600">No need to add up to 100 — slices scale relative to each other. You can rename them after.</p>
              </div>
            )}

            <button onClick={createWheel} disabled={creating || wheels.length >= MAX_WHEELS} className="saas-button w-full">
              {wheels.length >= MAX_WHEELS ? `Limit reached (${MAX_WHEELS})` : creating ? 'Creating…' : 'Create wheel'}
            </button>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-black text-white uppercase tracking-tight">
              Your wheels <span className="text-zinc-600">({wheels.length}/{MAX_WHEELS})</span>
            </h2>
            {wheels.length === 0 ? (
              <div className="bento-card py-20 text-center text-zinc-600 font-black  text-[11px]">
                No wheels yet
              </div>
            ) : (
              wheels.map((w) => (
                <div key={w.id} className="bento-card p-6 flex items-center justify-between gap-4 hover:border-brand-primary/30 transition-all">
                  <div className="min-w-0">
                    <h3 className="font-black text-white truncate">{w.title}</h3>
                    <p className="text-[11px] text-zinc-500 font-bold  mt-1">{w.segments.length} segments</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setSelectedId(w.id)} className="saas-button-secondary text-xs">Open</button>
                    <button
                      onClick={() => duplicateWheel(w)}
                      disabled={wheels.length >= MAX_WHEELS}
                      className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-zinc-600 hover:text-white hover:bg-white/[0.06] transition-all disabled:opacity-40 disabled:hover:text-zinc-600"
                      title={wheels.length >= MAX_WHEELS ? `Limit reached (${MAX_WHEELS})` : 'Duplicate'}
                    >
                      <Copy size={12} strokeWidth={2.5} />
                    </button>
                    <button onClick={() => deleteWheel(w.id)} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-zinc-600 hover:text-rose-400 hover:bg-rose-400/10 transition-all" title="Delete"><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
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

// ============================================================================
// Editor
// ============================================================================
function ManageWheel({
  wheel,
  spins,
  palettes,
  onPalettesChange,
  onSaved,
  onSpun,
}: {
  wheel: WheelGame;
  spins: Spin[];
  palettes: SavedPalette[];
  onPalettesChange: (next: SavedPalette[]) => void;
  onSaved: (w: WheelGame) => void;
  onSpun: () => void;
}) {
  const [title, setTitle] = useState(wheel.title);
  const [segments, setSegments] = useState<WheelSegment[]>(wheel.segments);
  const [config, setConfig] = useState<WheelConfig>(wheel.config ?? DEFAULT_WHEEL_CONFIG);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const rotationRef = useRef(0);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const overlayLink = `${origin}/overlay/wheel/${wheel.id}`;

  const patchConfig = (p: Partial<WheelConfig>) => {
    setConfig((c) => ({ ...c, ...p }));
    setDirty(true);
  };
  const patchSegments = (next: WheelSegment[]) => {
    setSegments(next);
    setDirty(true);
  };

  const save = useCallback(async (): Promise<WheelGame | null> => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/wheels/${wheel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title, segments, config }),
      });
      if (!res.ok) {
        alert('Failed to save');
        return null;
      }
      const data = await res.json();
      setDirty(false);
      onSaved(data.wheel);
      return data.wheel;
    } finally {
      setSaving(false);
    }
  }, [wheel.id, title, segments, config, onSaved]);

  const spin = async () => {
    if (spinning || segments.length < 2) return;
    // Spin always uses the server's saved wheel — save pending edits first.
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    setSpinning(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/wheels/${wheel.id}/spin`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Spin failed');
        setSpinning(false);
        return;
      }
      const arc = segmentArcs(segments)[data.index];
      const next = spinToAngle(rotationRef.current, arc.mid, config.pointer.angle, spinExtraTurns(config.spinSpeed));
      rotationRef.current = next;
      setRotation(next);
      setTimeout(() => {
        setResult(data.label);
        setSpinning(false);
        if (data.removed) {
          setSegments((prev) => prev.filter((_, i) => i !== data.index));
        }
        onSpun();
      }, spinDuration(config.spinSpeed) * 1000 + 150);
    } catch {
      setSpinning(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(overlayLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Wedges removed by remove-on-select spins can be brought back from the
  // server-side base_segments snapshot.
  const [restoring, setRestoring] = useState(false);
  const removedCount = Math.max(0, (wheel.baseSegments?.length ?? 0) - segments.length);
  const restore = async () => {
    setRestoring(true);
    try {
      const res = await fetch(`${API_BASE}/wheels/${wheel.id}/reset`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to restore wedges');
        return;
      }
      setSegments(data.wheel.segments);
      onSaved(data.wheel);
    } finally {
      setRestoring(false);
    }
  };

  const previewPx = Math.min(380, wheelSizePx(config.size));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_1fr] gap-8 items-start">
      {/* Left: live preview + spin + overlay link */}
      <div className="space-y-6">
        <div className="bento-card p-8 flex flex-col items-center gap-6">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            className="text-xl font-black text-white bg-transparent text-center outline-none focus:bg-white/[0.03] rounded-xl px-3 py-1 w-full"
          />
          <Wheel
            segments={segments}
            rotation={rotation}
            spinning={spinning}
            size={previewPx}
            durationSec={spinDuration(config.spinSpeed)}
            style={styleFromConfig(config)}
          />
          <button onClick={spin} disabled={spinning || segments.length < 2} className="saas-button w-full max-w-xs">
            {spinning ? 'Spinning…' : dirty ? 'Save & spin' : 'Spin'}
          </button>
          {result && !spinning && (
            <div className="px-6 py-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-black  text-center">
              {result}
            </div>
          )}
          {removedCount > 0 && !spinning && (
            <button
              onClick={restore}
              disabled={restoring}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white transition-colors"
            >
              <RotateCcw size={12} strokeWidth={2.5} />
              {restoring ? 'Restoring…' : `Restore ${removedCount} removed wedge${removedCount === 1 ? '' : 's'}`}
            </button>
          )}
          {segments.length < 2 && (
            <p className="text-amber-400 text-xs font-bold ">Add at least 2 segments to spin</p>
          )}
        </div>

        <div className="bento-card !rounded-2xl p-5">
          <p className="text-[10px] font-black  text-zinc-500 mb-2">OBS overlay link</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-brand-primary/80 truncate bg-black/30 rounded-lg px-3 py-2">{overlayLink}</code>
            <button onClick={copy} className="saas-button-secondary text-xs shrink-0">{copied ? 'Copied!' : 'Copy'}</button>
          </div>
          <p className="text-[10px] text-zinc-600 mt-2">Add as a Browser Source in OBS. Spins from this page animate there in real time.</p>
        </div>

        <div className="bento-card p-6">
          <h3 className="text-sm font-black text-white uppercase tracking-tight mb-4">Recent spins</h3>
          {spins.length === 0 ? (
            <p className="text-zinc-600 text-sm">No spins yet.</p>
          ) : (
            <div className="space-y-2">
              {spins.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-white font-bold">{s.result}</span>
                  <span className="text-zinc-600 text-[11px]">{new Date(s.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: customization */}
      <div className="space-y-6">
        <SegmentsEditor segments={segments} onChange={patchSegments} />
        <ColorThemesPanel
          palettes={palettes}
          onPalettesChange={onPalettesChange}
          onApply={(colors) => patchSegments(segments.map((s, i) => ({ ...s, color: colors[i % colors.length] })))}
        />
        <PointerPanel config={config} segments={segments} onChange={patchConfig} previewPx={previewPx} />
        <AppearancePanel config={config} onChange={patchConfig} />
        <AnnouncePanel config={config} onChange={patchConfig} />

        <div className="sticky bottom-4 z-20 flex items-center justify-end gap-3">
          {dirty && <span className="text-amber-400 text-xs font-bold ">Unsaved changes</span>}
          <button onClick={() => save()} disabled={!dirty || saving} className="saas-button px-8">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Segments editor ---------------------------------------------------------
function SegmentsEditor({ segments, onChange }: { segments: WheelSegment[]; onChange: (s: WheelSegment[]) => void }) {
  const update = (i: number, patch: Partial<WheelSegment>) =>
    onChange(segments.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => onChange(segments.filter((_, idx) => idx !== i));
  const add = () => onChange([...segments, { label: `Option ${segments.length + 1}`, color: PALETTE[segments.length % PALETTE.length] }]);

  return (
    <Panel title={`Segments (${segments.length})`}>
      <div className="space-y-2">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 bg-white/[0.02] rounded-xl p-2 border border-white/5">
            <ColorField value={segmentColor(s, i)} onChange={(color) => update(i, { color })} />
            <input
              value={s.label}
              onChange={(e) => update(i, { label: e.target.value })}
              className="flex-1 min-w-0 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-primary/50"
            />
            <input
              type="number"
              min={0}
              step={1}
              value={s.weight ?? 1}
              onChange={(e) => update(i, { weight: Math.max(0, Number(e.target.value) || 0) })}
              title="Slice size / odds"
              className="w-16 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-2 text-white text-sm outline-none focus:border-brand-primary/50"
            />
            <ImageUploadButton
              current={s.image}
              onUploaded={(url) => update(i, { image: url })}
              onClear={() => update(i, { image: undefined })}
            />
            <button onClick={() => remove(i)} className="p-2 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-400/10 shrink-0" title="Remove"><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
        ))}
      </div>
      <button onClick={add} className="saas-button-secondary w-full mt-3 text-xs">+ Add segment</button>
      <p className="text-[10px] text-zinc-600 mt-2">The number is the slice size — bigger means a wider wedge and better odds. It doesn't need to total anything.</p>
    </Panel>
  );
}

// ---- Color themes (preset + saved palettes, applied across all segments) -----
function ColorThemesPanel({
  palettes,
  onPalettesChange,
  onApply,
}: {
  palettes: SavedPalette[];
  onPalettesChange: (next: SavedPalette[]) => void;
  onApply: (colors: string[]) => void;
}) {
  // Theme builder — index is the palette being edited, null = creating a new one.
  const [draft, setDraft] = useState<{ index: number | null; name: string; colors: string[] } | null>(null);

  const saveDraft = () => {
    if (!draft || draft.colors.length === 0) return;
    const theme: SavedPalette = {
      name: draft.name.trim().slice(0, 24) || `My theme ${palettes.length + 1}`,
      colors: draft.colors.slice(0, 24),
    };
    const next =
      draft.index === null
        ? [...palettes, theme]
        : palettes.map((p, i) => (i === draft.index ? theme : p));
    onPalettesChange(next.slice(0, MAX_SAVED_PALETTES));
    setDraft(null);
  };

  const strip = (p: SavedPalette, key: React.Key, onEdit?: () => void, onDelete?: () => void) => (
    <div key={key} className="flex items-center gap-2">
      <button
        onClick={() => onApply(p.colors)}
        className="flex-1 min-w-0 flex items-center gap-3 group"
        title={`Apply "${p.name}" to all segments`}
      >
        <span className="flex h-7 flex-1 rounded-lg overflow-hidden border border-white/10 group-hover:border-brand-primary/40 transition-colors">
          {p.colors.map((c, i) => (
            <span key={i} className="flex-1" style={{ background: c }} />
          ))}
        </span>
        <span className="text-[10px] font-black text-zinc-400 group-hover:text-white w-20 text-left truncate transition-colors">
          {p.name}
        </span>
      </button>
      {onEdit && (
        <button onClick={onEdit} className="p-1.5 rounded-lg text-zinc-600 hover:text-white shrink-0" title="Edit theme"><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
      )}
      {onDelete && (
        <button onClick={onDelete} className="p-1.5 rounded-lg text-zinc-600 hover:text-rose-400 shrink-0" title="Delete theme"><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      )}
    </div>
  );

  return (
    <Panel title="Color themes">
      <div className="space-y-2">{PRESET_PALETTES.map((p) => strip(p, p.name))}</div>
      <div className="mt-4 pt-4 border-t border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-black  text-zinc-500">Your themes</span>
          {!draft && (
            <button
              onClick={() => setDraft({ index: null, name: '', colors: PALETTE.slice(0, 5) })}
              disabled={palettes.length >= MAX_SAVED_PALETTES}
              className="saas-button-secondary text-xs"
            >
              + New theme
            </button>
          )}
        </div>

        {draft && (
          <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 mb-3 space-y-3">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Theme name"
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-primary/50"
            />
            <div className="flex flex-wrap gap-2">
              {draft.colors.map((c, i) => (
                <div key={i} className="flex items-center gap-0.5">
                  <ColorField
                    value={c}
                    onChange={(color) => setDraft({ ...draft, colors: draft.colors.map((x, idx) => (idx === i ? color : x)) })}
                  />
                  <button
                    onClick={() => setDraft({ ...draft, colors: draft.colors.filter((_, idx) => idx !== i) })}
                    className="p-1 rounded text-zinc-600 hover:text-rose-400"
                    title="Remove color"
                  ><svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>
              ))}
              {draft.colors.length < 24 && (
                <button
                  onClick={() => setDraft({ ...draft, colors: [...draft.colors, PALETTE[draft.colors.length % PALETTE.length]] })}
                  className="w-8 h-8 rounded-lg bg-white/[0.03] border border-dashed border-white/20 text-zinc-400 hover:text-white text-sm font-bold"
                  title="Add color"
                >
                  +
                </button>
              )}
            </div>
            {/* Live preview strip */}
            <div className="flex h-5 rounded-lg overflow-hidden border border-white/10">
              {draft.colors.map((c, i) => (
                <span key={i} className="flex-1" style={{ background: c }} />
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDraft(null)} className="saas-button-secondary text-xs">Cancel</button>
              <button onClick={saveDraft} disabled={draft.colors.length === 0} className="saas-button text-xs px-5">
                {draft.index === null ? 'Save theme' : 'Update theme'}
              </button>
            </div>
          </div>
        )}

        {palettes.length === 0 && !draft ? (
          <p className="text-[10px] text-zinc-600">No themes yet — build one with your own colors and reuse it on any wheel.</p>
        ) : (
          <div className="space-y-2">
            {palettes.map((p, i) =>
              strip(
                p,
                i,
                () => setDraft({ index: i, name: p.name, colors: [...p.colors] }),
                () => onPalettesChange(palettes.filter((_, idx) => idx !== i)),
              ),
            )}
          </div>
        )}
      </div>
      <p className="text-[10px] text-zinc-600 mt-3">Click a theme to recolor every wedge. Colors repeat if the wheel has more wedges than the theme has colors.</p>
    </Panel>
  );
}

// ---- Pointer panel (style/color/image + draggable angle) ---------------------
function PointerPanel({
  config,
  segments,
  onChange,
  previewPx,
}: {
  config: WheelConfig;
  segments: WheelSegment[];
  onChange: (p: Partial<WheelConfig>) => void;
  previewPx: number;
}) {
  const setPointer = (p: Partial<WheelConfig['pointer']>) => onChange({ pointer: { ...config.pointer, ...p } });

  return (
    <Panel title="Pointer">
      <div className="flex gap-2 mb-4">
        {(['default', 'image'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setPointer({ type: t })}
            className={cn(
              'flex-1 py-2 rounded-xl text-[10px] font-black  border transition-all',
              config.pointer.type === t ? 'bg-brand-primary/20 border-brand-primary/40 text-white' : 'bg-white/[0.03] border-white/10 text-zinc-400',
            )}
          >
            {t === 'default' ? 'Built-in' : 'Custom image'}
          </button>
        ))}
      </div>

      {config.pointer.type === 'default' ? (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-2">
            {(['arrow', 'triangle', 'pin'] as PointerStyle[]).map((st) => (
              <button
                key={st}
                onClick={() => setPointer({ style: st })}
                className={cn(
                  'px-3 py-2 rounded-xl text-[10px] font-black  border capitalize',
                  config.pointer.style === st ? 'bg-brand-primary/20 border-brand-primary/40 text-white' : 'bg-white/[0.03] border-white/10 text-zinc-400',
                )}
              >
                {st}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-400 font-bold">
            Color
            <ColorField value={config.pointer.color} onChange={(color) => setPointer({ color })} />
          </label>
        </div>
      ) : (
        <ImageUploadButton
          current={config.pointer.imageUrl ?? undefined}
          label="Upload pointer image"
          onUploaded={(url) => setPointer({ imageUrl: url })}
          onClear={() => setPointer({ imageUrl: null })}
          wide
        />
      )}

      {/* Angle picker */}
      <div className="mt-5 pt-5 border-t border-white/5">
        <div className="flex items-center justify-between mb-3">
          <label className="text-[10px] font-black  text-zinc-500">Pointer position</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={Math.round(config.pointer.angle)}
              onChange={(e) => setPointer({ angle: ((Number(e.target.value) % 360) + 360) % 360 })}
              className="w-20 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm text-right outline-none focus:border-brand-primary/50"
            />
            <span className="text-zinc-500 text-sm">°</span>
          </div>
        </div>
        <AngleDial
          angle={config.pointer.angle}
          segments={segments}
          size={Math.min(220, previewPx)}
          onChange={(angle) => setPointer({ angle })}
        />
        <p className="text-[10px] text-zinc-600 mt-2 text-center">Drag the dot around the rim — it snaps to wedge edges, wedge centers and 45° marks. Type an exact angle above for anything specific.</p>
      </div>
    </Panel>
  );
}

/** Draggable handle that slides around the wheel rim, with snapping. */
function AngleDial({
  angle,
  segments,
  size,
  onChange,
}: {
  angle: number;
  segments: WheelSegment[];
  size: number;
  onChange: (deg: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const snapTargets = useCallback(() => {
    const t = new Set<number>();
    for (let a = 0; a < 360; a += 45) t.add(a);
    for (const arc of segmentArcs(segments)) {
      t.add(((arc.start % 360) + 360) % 360);
      t.add(((arc.mid % 360) + 360) % 360);
    }
    return [...t];
  }, [segments]);

  const handleFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      let deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // clockwise from top
      deg = (deg + 360) % 360;
      // snap within 6°
      let best = deg;
      let bestDist = 6;
      for (const target of snapTargets()) {
        const d = Math.min(Math.abs(deg - target), 360 - Math.abs(deg - target));
        if (d < bestDist) {
          bestDist = d;
          best = target;
        }
      }
      onChange(Math.round(best));
    },
    [onChange, snapTargets],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      handleFromEvent(e.clientX, e.clientY);
    };
    const up = () => { dragging.current = false; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [handleFromEvent]);

  const r = size / 2;
  const knobR = r - 10;
  const a = (angle * Math.PI) / 180;
  const knobX = r + knobR * Math.sin(a);
  const knobY = r - knobR * Math.cos(a);

  return (
    <div
      ref={ref}
      className="relative mx-auto cursor-pointer touch-none"
      style={{ width: size, height: size }}
      onPointerDown={(e) => { dragging.current = true; handleFromEvent(e.clientX, e.clientY); }}
    >
      <div className="absolute inset-2 rounded-full border-2 border-dashed border-white/15" />
      {/* segment edge ticks */}
      {segmentArcs(segments).map((arc, i) => {
        const ta = (arc.start * Math.PI) / 180;
        return (
          <div
            key={i}
            className="absolute w-px h-2 bg-white/25"
            style={{ left: r + (r - 6) * Math.sin(ta), top: r - (r - 6) * Math.cos(ta), transform: `translate(-50%,-50%) rotate(${arc.start}deg)` }}
          />
        );
      })}
      <div
        className="absolute w-5 h-5 rounded-full bg-brand-primary border-2 border-white shadow-glow-p"
        style={{ left: knobX, top: knobY, transform: 'translate(-50%,-50%)' }}
      />
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-zinc-500 ">
        {Math.round(angle)}°
      </div>
    </div>
  );
}

// ---- Appearance panel (size, speed, stroke, center image, remove-on-select) --
function AppearancePanel({ config, onChange }: { config: WheelConfig; onChange: (p: Partial<WheelConfig>) => void }) {
  return (
    <Panel title="Appearance & behavior">
      <Row label="Wheel size">
        <div className="flex gap-1.5">
          {(['sm', 'md', 'lg', 'xl'] as const).map((s) => (
            <button
              key={s}
              onClick={() => onChange({ size: s })}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border',
                config.size === s ? 'bg-brand-primary/20 border-brand-primary/40 text-white' : 'bg-white/[0.03] border-white/10 text-zinc-400',
              )}
            >
              {({ sm: 'S', md: 'M', lg: 'L', xl: 'XL' } as Record<string, string>)[s]}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Spin speed">
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => onChange({ spinSpeed: n as 1 | 2 | 3 | 4 })}
              className={cn(
                'w-9 py-1.5 rounded-lg text-xs font-black border',
                config.spinSpeed === n ? 'bg-brand-primary/20 border-brand-primary/40 text-white' : 'bg-white/[0.03] border-white/10 text-zinc-400',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Wedge outline">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={12}
            value={config.strokeWidth}
            onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
            className="w-32 accent-brand-primary"
          />
          <span className="text-xs text-zinc-400 w-8">{config.strokeWidth}px</span>
          <ColorField value={config.strokeColor.startsWith('#') ? config.strokeColor : '#000000'} onChange={(strokeColor) => onChange({ strokeColor })} />
        </div>
      </Row>

      <Row label="Center image">
        <div className="flex items-center gap-3">
          <Toggle on={config.centerImage.enabled} onChange={(enabled) => onChange({ centerImage: { ...config.centerImage, enabled } })} />
          {config.centerImage.enabled && (
            <ImageUploadButton
              current={config.centerImage.url ?? undefined}
              onUploaded={(url) => onChange({ centerImage: { enabled: true, url } })}
              onClear={() => onChange({ centerImage: { enabled: true, url: null } })}
            />
          )}
        </div>
      </Row>

      <Row label="Remove wedge after it's selected">
        <Toggle on={config.removeOnSelect} onChange={(removeOnSelect) => onChange({ removeOnSelect })} />
      </Row>
    </Panel>
  );
}

// ---- Announce panel ----------------------------------------------------------
function AnnouncePanel({ config, onChange }: { config: WheelConfig; onChange: (p: Partial<WheelConfig>) => void }) {
  const a = config.announce;
  const setA = (p: Partial<WheelConfig['announce']>) => onChange({ announce: { ...a, ...p } });

  return (
    <Panel title="Announce & sound">
      <Row label="Show result banner on overlay">
        <Toggle on={a.enabled} onChange={(enabled) => setA({ enabled })} />
      </Row>
      <Row label="Announce result in Twitch chat">
        <Toggle on={a.chat} onChange={(chat) => setA({ chat })} />
      </Row>
      {a.chat && (
        <p className="text-[10px] text-amber-400/80 -mt-2 mb-2">Posts as you. Needs the chat-write permission — re-connect Twitch if messages don't appear.</p>
      )}

      <Row label="Spinning sound">
        <div className="flex items-center gap-3">
          <Toggle on={a.spinSound.enabled} onChange={(enabled) => setA({ spinSound: { ...a.spinSound, enabled } })} />
          {a.spinSound.enabled && (
            <AudioUploadButton
              current={a.spinSound.url}
              onUploaded={(url) => setA({ spinSound: { enabled: true, url } })}
              onClear={() => setA({ spinSound: { enabled: true, url: null } })}
            />
          )}
        </div>
      </Row>

      <Row label="Result sound">
        <div className="flex items-center gap-3">
          <Toggle on={a.sound.enabled} onChange={(enabled) => setA({ sound: { ...a.sound, enabled } })} />
          {a.sound.enabled && (
            <AudioUploadButton
              current={a.sound.url}
              onUploaded={(url) => setA({ sound: { enabled: true, url } })}
              onClear={() => setA({ sound: { enabled: true, url: null } })}
            />
          )}
        </div>
      </Row>
    </Panel>
  );
}

// ============================================================================
// Small shared UI primitives
// ============================================================================
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bento-card p-6">
      <h3 className="text-sm font-black text-white uppercase tracking-tight mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-sm text-zinc-300 font-medium">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn('relative w-11 h-6 rounded-full transition-all shrink-0', on ? 'bg-brand-primary' : 'bg-white/10')}
    >
      <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

/** Color swatch + native picker, with an EyeDropper "pick from screen" button. */
function ColorField({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const hasDropper = typeof window !== 'undefined' && 'EyeDropper' in window;
  const pick = async () => {
    try {
      // @ts-expect-error EyeDropper is not yet in TS lib DOM defs
      const result = await new window.EyeDropper().open();
      if (result?.sRGBHex) onChange(result.sRGBHex);
    } catch {
      /* user cancelled */
    }
  };
  return (
    <div className="flex items-center gap-1 shrink-0">
      <label className="relative w-8 h-8 rounded-lg border border-white/15 cursor-pointer overflow-hidden" style={{ background: value }}>
        <input type="color" value={value.startsWith('#') ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
      </label>
      {hasDropper && (
        <button onClick={pick} title="Pick a color from anywhere on screen" className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/10 text-zinc-400 hover:text-white flex items-center justify-center">
          {/* eyedropper glyph */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>
        </button>
      )}
    </div>
  );
}

function ImageUploadButton({
  current,
  onUploaded,
  onClear,
  label,
  wide,
}: {
  current?: string;
  onUploaded: (url: string) => void;
  onClear: () => void;
  label?: string;
  wide?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const url = await uploadAsset(file);
    setBusy(false);
    if (url) onUploaded(url);
    else alert('Upload failed');
    e.target.value = '';
  };
  if (current) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <img src={current} alt="" className="w-8 h-8 rounded-lg object-cover border border-white/15" />
        <button onClick={onClear} className="p-1.5 rounded-lg text-zinc-600 hover:text-rose-400" title="Remove image"><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    );
  }
  return (
    <label className={cn('cursor-pointer shrink-0 inline-flex items-center justify-center rounded-lg bg-white/[0.03] border border-white/10 text-zinc-400 hover:text-white text-xs font-bold', wide ? 'w-full py-3 gap-2' : 'w-8 h-8')}>
      <input type="file" accept="image/*" onChange={onPick} className="hidden" />
      {busy ? '…' : wide ? (label ?? 'Upload image') : <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>}
    </label>
  );
}

function AudioUploadButton({
  current,
  onUploaded,
  onClear,
}: {
  current: string | null;
  onUploaded: (url: string) => void;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const url = await uploadAsset(file);
    setBusy(false);
    if (url) onUploaded(url);
    else alert('Upload failed');
    e.target.value = '';
  };
  return (
    <div className="flex items-center gap-2">
      {current ? (
        <>
          <button onClick={() => new Audio(current).play().catch(() => undefined)} className="saas-button-secondary text-xs">▶ Test</button>
          <button onClick={onClear} className="p-1.5 rounded-lg text-zinc-600 hover:text-rose-400" title="Remove sound"><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </>
      ) : (
        <label className="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-white/[0.03] border border-white/10 text-zinc-400 hover:text-white text-xs font-bold px-3 py-1.5">
          <input type="file" accept="audio/*" onChange={onPick} className="hidden" />
          {busy ? 'Uploading…' : 'Upload sound'}
        </label>
      )}
    </div>
  );
}

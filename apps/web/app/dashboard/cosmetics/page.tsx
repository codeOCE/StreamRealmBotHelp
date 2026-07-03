"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { DEFAULT_PAINT, PAINT_KEYFRAMES_CSS, Paint, paintToStyle } from '@/lib/paint';
import { VoidSelect } from '@/components/dashboard/VoidSelect';

type Kind = 'badge' | 'paint';
type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
type Source = 'manual' | 'loyalty';

interface Cosmetic {
  id: string;
  kind: Kind;
  name: string;
  description: string;
  rarity: Rarity;
  source: Source | 'tcg';
  imageUrl: string | null;
  paint: Paint;
  requirement: { minLevel?: number };
  enabled: boolean;
  sort: number;
  global: boolean;
}

interface Assignment {
  id: string;
  cosmeticId: string;
  cosmeticName: string;
  cosmeticKind: Kind | null;
  rarity: Rarity;
  viewerLogin: string;
  equipped: boolean;
  grantedBy: string;
  createdAt: string;
}

const RARITY_META: Record<Rarity, { label: string; color: string }> = {
  common: { label: 'Common', color: '#9ca3af' },
  rare: { label: 'Rare', color: '#3b82f6' },
  epic: { label: 'Epic', color: '#a855f7' },
  legendary: { label: 'Legendary', color: '#f59e0b' },
  mythic: { label: 'Mythic', color: '#ec4899' },
};

const blankCosmetic = (): Partial<Cosmetic> => ({
  kind: 'paint',
  name: '',
  description: '',
  rarity: 'epic',
  source: 'manual',
  imageUrl: '',
  paint: structuredClone(DEFAULT_PAINT),
  requirement: { minLevel: 10 },
  enabled: true,
});

export default function CosmeticsPage() {
  const [cosmetics, setCosmetics] = useState<Cosmetic[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Cosmetic> | null>(null);

  const COS = apiUrl('/api/cosmetics');
  const ASSIGN = apiUrl('/api/cosmetics/assignments');

  const loadCosmetics = async () => {
    const r = await fetch(COS, { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
    setCosmetics(Array.isArray(r.cosmetics) ? r.cosmetics : []);
  };
  const loadAssignments = async () => {
    const r = await fetch(ASSIGN, { credentials: 'include' }).then((x) => x.json()).catch(() => ({}));
    setAssignments(Array.isArray(r.assignments) ? r.assignments : []);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadCosmetics(), loadAssignments()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (c: Partial<Cosmetic>) => {
    const body = {
      kind: c.kind, name: c.name, description: c.description, rarity: c.rarity,
      source: c.source, imageUrl: c.imageUrl, paint: c.paint, requirement: c.requirement,
    };
    if (c.id) {
      await fetch(`${COS}/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' });
    } else {
      await fetch(COS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' });
    }
    setEditing(null);
    loadCosmetics();
  };
  const toggle = async (id: string) => { await fetch(`${COS}/${id}/toggle`, { method: 'PATCH', credentials: 'include' }); loadCosmetics(); };
  const remove = async (id: string) => {
    if (!confirm('Delete this cosmetic? It will be removed from everyone who has it.')) return;
    await fetch(`${COS}/${id}`, { method: 'DELETE', credentials: 'include' });
    setCosmetics((xs) => xs.filter((c) => c.id !== id));
  };
  const revoke = async (id: string) => {
    await fetch(`${ASSIGN}/${id}`, { method: 'DELETE', credentials: 'include' });
    setAssignments((xs) => xs.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <style>{PAINT_KEYFRAMES_CSS}</style>

      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white font-heading">Chat Cosmetics</h1>
          <p className="text-brand-muted text-sm font-medium mt-1 max-w-2xl">
            Design <span className="text-brand-primary">badges</span> and animated <span className="text-brand-primary">paints</span> for your viewers&apos; names.
            Anyone with the CreatorCastle browser extension sees them live in your Twitch chat. Grant them by hand or tie them to a loyalty level.
          </p>
        </div>
        <button onClick={() => setEditing(blankCosmetic())} className="saas-button">+ New Cosmetic</button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Cosmetic library */}
        <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5">
          {loading ? (
            [0, 1, 2, 3].map((i) => <div key={i} className="glass-card rounded-[2rem] p-7 border border-white/5"><div className="skeleton h-24 w-full rounded-xl" /></div>)
          ) : cosmetics.length === 0 ? (
            <div className="md:col-span-2 py-24 flex flex-col items-center justify-center bento-card gap-6">
              <div className="text-5xl opacity-30">🎨</div>
              <p className="text-zinc-700 font-black  text-[11px]">No cosmetics yet</p>
              <button onClick={() => setEditing(blankCosmetic())} className="saas-button">Create your first paint</button>
            </div>
          ) : cosmetics.map((c) => (
            <CosmeticCard key={c.id} c={c} onEdit={() => setEditing(structuredClone(c))} onToggle={() => toggle(c.id)} onDelete={() => remove(c.id)} />
          ))}
        </div>

        {/* Assignments */}
        <AssignPanel
          cosmetics={cosmetics}
          assignments={assignments}
          onGranted={loadAssignments}
          onRevoke={revoke}
          assignUrl={ASSIGN}
        />
      </div>

      {editing && (
        <CosmeticModal initial={editing} onClose={() => setEditing(null)} onSave={save} />
      )}
    </div>
  );
}

/* ─────────────────────────── Cosmetic card ─────────────────────────── */
function PaintName({ paint, children }: { paint: Paint; children: React.ReactNode }) {
  return (
    <span className={cn('font-black', paint.animation && paint.animation !== 'none' && `cc-paint--${paint.animation}`)} style={paintToStyle(paint)}>
      {children}
    </span>
  );
}

function CosmeticCard({ c, onEdit, onToggle, onDelete }: { c: Cosmetic; onEdit: () => void; onToggle: () => void; onDelete: () => void }) {
  const rarity = RARITY_META[c.rarity];
  return (
    <div className={cn('glass-card rounded-[2rem] p-6 border transition-all duration-300', c.enabled ? 'border-white/5 hover:border-brand-primary/40' : 'opacity-40 grayscale border-white/5')}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
            {c.kind === 'badge'
              ? (c.imageUrl ? <img src={c.imageUrl} alt="" className="w-7 h-7 object-contain" /> : <span className="text-xl opacity-40">🏷️</span>)
              : <span className="text-xl">🎨</span>}
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-white truncate">{c.name}</h3>
            <p className="text-[11px] text-zinc-500 line-clamp-2 leading-snug">{c.description || '—'}</p>
          </div>
        </div>
        {c.global ? (
          <span className="text-[8px] font-black  px-2 py-1 rounded-lg border border-amber-400/20 bg-amber-400/10 text-amber-300 shrink-0">Castle</span>
        ) : (
          <button onClick={onToggle} className="w-12 h-6 rounded-full relative transition-colors border border-white/10 p-0.5 shrink-0 cursor-pointer" style={{ background: c.enabled ? 'var(--brand-primary, #a855f7)' : '#18181b' }} aria-label="Toggle">
            <div className="w-5 h-5 bg-white rounded-full transition-transform" style={{ transform: c.enabled ? 'translateX(24px)' : 'translateX(0)' }} />
          </button>
        )}
      </div>

      {/* Live preview */}
      <div className="rounded-xl bg-black/40 border border-white/5 px-3 py-2.5 mb-4 flex items-center gap-1.5 text-sm">
        {c.kind === 'badge' && c.imageUrl && <img src={c.imageUrl} alt="" className="w-4 h-4 object-contain" />}
        {c.kind === 'paint'
          ? <PaintName paint={c.paint}>CastleFan</PaintName>
          : <span className="font-black text-white">CastleFan</span>}
        <span className="text-zinc-500">: gg that was clean</span>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2 flex-wrap text-[9px] font-black ">
          <span className="px-2 py-1 rounded-lg border" style={{ color: rarity.color, borderColor: `${rarity.color}33`, background: `${rarity.color}1a` }}>{rarity.label}</span>
          <span className="px-2 py-1 rounded-lg border text-zinc-400 bg-white/5 border-white/10">{c.kind}</span>
          {c.source === 'loyalty' && <span className="px-2 py-1 rounded-lg border text-emerald-300 bg-emerald-400/10 border-emerald-400/20">Lvl {c.requirement?.minLevel ?? 0}+</span>}
        </div>
        {!c.global && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onEdit} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-zinc-600 hover:text-white hover:bg-brand-primary/20 transition-colors cursor-pointer" aria-label="Edit">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
            </button>
            <button onClick={onDelete} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-zinc-600 hover:text-rose-400 hover:bg-rose-400/10 transition-colors cursor-pointer" aria-label="Delete">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Assign panel ─────────────────────────── */
function AssignPanel({ cosmetics, assignments, onGranted, onRevoke, assignUrl }: {
  cosmetics: Cosmetic[]; assignments: Assignment[]; onGranted: () => void; onRevoke: (id: string) => void; assignUrl: string;
}) {
  const [login, setLogin] = useState('');
  const [cosmeticId, setCosmeticId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Only manual-grantable cosmetics in the picker (loyalty ones are automatic).
  const grantable = useMemo(() => cosmetics.filter((c) => c.source !== 'loyalty'), [cosmetics]);

  const grant = async () => {
    setErr('');
    if (!login.trim() || !cosmeticId) { setErr('Pick a cosmetic and enter a viewer.'); return; }
    setBusy(true);
    const r = await fetch(assignUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ viewerLogin: login.trim(), cosmeticId }),
    });
    setBusy(false);
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'Could not grant.'); return; }
    setLogin('');
    onGranted();
  };

  return (
    <div className="glass-card rounded-[2rem] p-6 border border-white/5 self-start">
      <h3 className="text-sm font-black  text-zinc-300 mb-5">Grant to a viewer</h3>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-black  text-zinc-500">Twitch username</label>
          <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="e.g. castlefan"
            className="w-full mt-1.5 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-brand-primary/50" />
        </div>
        <div>
          <label className="text-[10px] font-black  text-zinc-500">Cosmetic</label>
          <VoidSelect value={cosmeticId} onChange={(e) => setCosmeticId(e.target.value)} className="mt-1.5">
            <option value="">Select…</option>
            {grantable.map((c) => <option key={c.id} value={c.id}>{c.kind === 'badge' ? '🏷️' : '🎨'} {c.name}</option>)}
          </VoidSelect>
        </div>
        {err && <p className="text-[11px] text-rose-400 font-semibold">{err}</p>}
        <button onClick={grant} disabled={busy} className="saas-button w-full justify-center disabled:opacity-50">{busy ? 'Granting…' : 'Grant cosmetic'}</button>
        <p className="text-[10px] text-zinc-600 leading-relaxed">Loyalty cosmetics are applied automatically and don&apos;t appear here.</p>
      </div>

      <div className="mt-6 pt-5 border-t border-white/[0.05]">
        <h4 className="text-[10px] font-black  text-zinc-500 mb-3">Granted ({assignments.length})</h4>
        <div className="space-y-2 max-h-[22rem] overflow-y-auto">
          {assignments.length === 0 ? (
            <p className="text-xs text-zinc-600 py-6 text-center font-semibold">No manual grants yet.</p>
          ) : assignments.map((a) => (
            <div key={a.id} className="px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-white font-semibold truncate"><span className="text-brand-primary">{a.viewerLogin}</span> · {a.cosmeticName}</p>
                <p className="text-[10px] text-zinc-600  font-black">{a.cosmeticKind ?? '—'} · {a.grantedBy}</p>
              </div>
              <button onClick={() => onRevoke(a.id)} className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 transition-colors shrink-0">Revoke</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Editor modal ─────────────────────────── */
function CosmeticModal({ initial, onClose, onSave }: { initial: Partial<Cosmetic>; onClose: () => void; onSave: (c: Partial<Cosmetic>) => void }) {
  const [c, setC] = useState<Partial<Cosmetic>>(initial);
  const paint = (c.paint ?? DEFAULT_PAINT) as Paint;
  const set = (patch: Partial<Cosmetic>) => setC((p) => ({ ...p, ...patch }));
  const setPaint = (patch: Partial<Paint>) => setC((p) => ({ ...p, paint: { ...(p.paint as Paint), ...patch } }));
  const setStop = (i: number, patch: Partial<{ color: string; at: number }>) =>
    setC((p) => { const stops = [...(p.paint as Paint).stops]; stops[i] = { ...stops[i], ...patch }; return { ...p, paint: { ...(p.paint as Paint), stops } }; });

  const valid = !!c.name?.trim() && (c.kind === 'paint' || (c.kind === 'badge' && !!c.imageUrl?.trim()));

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card rounded-[2rem] border border-white/10 w-full max-w-lg max-h-[90vh] overflow-y-auto p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-white">{c.id ? 'Edit' : 'New'} cosmetic</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Kind toggle */}
        <div className="flex gap-2 mb-5">
          {(['paint', 'badge'] as Kind[]).map((k) => (
            <button key={k} onClick={() => set({ kind: k })} className={cn('flex-1 py-2.5 rounded-xl text-xs font-black  border transition-colors', c.kind === k ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white/[0.02] text-zinc-500 border-white/10 hover:text-white')}>
              {k === 'paint' ? '🎨 Paint' : '🏷️ Badge'}
            </button>
          ))}
        </div>

        {/* Live preview */}
        <div className="rounded-xl bg-black/50 border border-white/5 px-4 py-3 mb-5 flex items-center gap-1.5">
          <style>{PAINT_KEYFRAMES_CSS}</style>
          {c.kind === 'badge' && c.imageUrl && <img src={c.imageUrl} alt="" className="w-5 h-5 object-contain" />}
          {c.kind === 'paint'
            ? <span className={cn('font-black', paint.animation && paint.animation !== 'none' && `cc-paint--${paint.animation}`)} style={paintToStyle(paint)}>{c.name || 'CastleFan'}</span>
            : <span className="font-black text-white">{c.name || 'CastleFan'}</span>}
          <span className="text-zinc-500 text-sm">: preview</span>
        </div>

        <div className="space-y-4">
          <Field label="Name"><input value={c.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="Royal Shimmer" className={inputCls} /></Field>
          <Field label="Description"><input value={c.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="Optional" className={inputCls} /></Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Rarity">
              <VoidSelect value={c.rarity} onChange={(e) => set({ rarity: e.target.value as Rarity })}>
                {Object.entries(RARITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </VoidSelect>
            </Field>
            <Field label="How it's earned">
              <VoidSelect value={c.source} onChange={(e) => set({ source: e.target.value as Source })}>
                <option value="manual">Granted by hand</option>
                <option value="loyalty">Loyalty level</option>
              </VoidSelect>
            </Field>
          </div>

          {c.source === 'loyalty' && (
            <Field label="Minimum loyalty level">
              <input type="number" min={1} value={c.requirement?.minLevel ?? 10} onChange={(e) => set({ requirement: { minLevel: Math.max(1, Number(e.target.value) || 1) } })} className={inputCls} />
            </Field>
          )}

          {c.kind === 'badge' ? (
            <Field label="Badge image URL">
              <input value={c.imageUrl ?? ''} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="https://…/badge.png" className={inputCls} />
            </Field>
          ) : (
            <div className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Gradient">
                  <VoidSelect value={paint.function} onChange={(e) => setPaint({ function: e.target.value as Paint['function'] })}>
                    <option value="linear-gradient">Linear</option>
                    <option value="radial-gradient">Radial</option>
                  </VoidSelect>
                </Field>
                <Field label="Animation">
                  <VoidSelect value={paint.animation} onChange={(e) => setPaint({ animation: e.target.value as Paint['animation'] })}>
                    <option value="none">None</option>
                    <option value="shimmer">Shimmer</option>
                    <option value="sheen">Sheen</option>
                    <option value="rainbow">Rainbow</option>
                  </VoidSelect>
                </Field>
              </div>

              {paint.function === 'linear-gradient' && (
                <Field label={`Angle · ${paint.angle}°`}>
                  <input type="range" min={0} max={360} value={paint.angle} onChange={(e) => setPaint({ angle: Number(e.target.value) })} className="w-full accent-[var(--brand-primary,#a855f7)]" />
                </Field>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-black  text-zinc-500">Colours</label>
                  <div className="flex gap-2">
                    <button onClick={() => setPaint({ stops: [...paint.stops, { color: '#ffffff', at: 100 }] })} className="text-[10px] font-black uppercase text-brand-primary hover:underline">+ Add</button>
                    {paint.stops.length > 2 && <button onClick={() => setPaint({ stops: paint.stops.slice(0, -1) })} className="text-[10px] font-black uppercase text-rose-400 hover:underline">− Remove</button>}
                  </div>
                </div>
                <div className="space-y-2">
                  {paint.stops.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="color" value={s.color} onChange={(e) => setStop(i, { color: e.target.value })} className="w-9 h-9 rounded-lg bg-transparent border border-white/10 cursor-pointer" />
                      <input value={s.color} onChange={(e) => setStop(i, { color: e.target.value })} className={cn(inputCls, 'flex-1')} />
                      <input type="number" min={0} max={100} value={s.at} onChange={(e) => setStop(i, { at: Number(e.target.value) })} className={cn(inputCls, 'w-20')} />
                    </div>
                  ))}
                </div>
              </div>

              <Field label="Glow (optional)">
                <input value={paint.shadow ?? ''} onChange={(e) => setPaint({ shadow: e.target.value })} placeholder="0 0 8px rgba(168,85,247,.6)" className={inputCls} />
              </Field>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-7">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-xs font-black  bg-white/[0.03] border border-white/10 text-zinc-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={() => onSave(c)} disabled={!valid} className="flex-1 saas-button justify-center disabled:opacity-40">Save</button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-brand-primary/50';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-black  text-zinc-500">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

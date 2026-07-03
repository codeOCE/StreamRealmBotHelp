'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useEditor, Widget } from '../store';
import {
    buildAlertSrcDoc,
    getAlertEventConfig,
    DEFAULT_ALERT_HTML,
    DEFAULT_ALERT_CSS,
    DEFAULT_ALERT_JS,
    AlertData,
    AlertSound,
    AlertVariation,
} from '@/lib/alert-renderer';
import { apiUrl } from '@/lib/api';
import { ScaledAlertFrame } from '@/components/ScaledAlertFrame';
import { PresetGallery } from './PresetGallery';
import { AlertPreset } from '@/lib/alert-presets';
import { X, RotateCcw, Zap, Bell, Clock, Info, RefreshCw, LayoutGrid } from 'lucide-react';

// ── Event definitions ──────────────────────────────────────────────────────

const EVENTS = [
    {
        key: 'follow',
        label: 'Follow',
        hasAmount: false,
        preview: { type: 'follow', username: 'StreamFan', message: '' } as AlertData,
    },
    {
        key: 'subscribe',
        label: 'Subscribe',
        hasAmount: false,
        preview: { type: 'subscribe', username: 'NewSub', message: 'Love the stream!', tier: '1000' } as AlertData,
    },
    {
        key: 'cheer',
        label: 'Cheer',
        hasAmount: true,
        amountLabel: 'Min bits',
        preview: { type: 'cheer', username: 'BitsDonor', message: 'GG!', amount: 100 } as AlertData,
    },
    {
        key: 'raid',
        label: 'Raid',
        hasAmount: true,
        amountLabel: 'Min raiders',
        preview: { type: 'raid', username: 'RaidLeader', message: '', amount: 25 } as AlertData,
    },
    {
        key: 'donation',
        label: 'Tip',
        hasAmount: true,
        amountLabel: 'Min amount',
        preview: { type: 'donation', username: 'Supporter', message: 'Keep it up!', amount: 5.0 } as AlertData,
    },
    {
        key: 'gift',
        label: 'Gift Sub',
        hasAmount: true,
        amountLabel: 'Min gifted',
        preview: { type: 'gift', username: 'GiftGiver', message: '', amount: 1 } as AlertData,
    },
] as const;

const VARIABLES = [
    { v: '{username}', desc: 'Display name of the viewer who triggered the event' },
    { v: '{type}',     desc: 'Event type: follow, subscribe, cheer, raid, donation, gift' },
    { v: '{message}',  desc: 'Message left by the viewer (sub, cheer, tip)' },
    { v: '{amount}',   desc: 'Bits cheered, raider count, or tip amount' },
    { v: '{tier}',     desc: 'Sub tier: 1000 (Tier 1), 2000 (Tier 2), 3000 (Tier 3)' },
    { v: '{variant}',  desc: 'Name of the matched variation (empty when none matched)' },
];

type CodeTab = 'html' | 'css' | 'js';
const CODE_KEY: Record<CodeTab, string> = { html: 'htmlTemplate', css: 'customCss', js: 'customJs' };
const CODE_DEFAULT: Record<CodeTab, string> = { html: DEFAULT_ALERT_HTML, css: DEFAULT_ALERT_CSS, js: DEFAULT_ALERT_JS };
const CODE_PLACEHOLDER: Record<CodeTab, string> = {
    html: '<div id="alert">\n  <div class="username">{username}</div>\n</div>',
    css: '#alert {\n  /* your styles */\n}',
    js: '// window.alertData = { type, username, message, amount, tier }',
};

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
    widget: Widget;
    onClose: () => void;
}

export function AlertEditorModal({ widget, onClose }: Props) {
    const { state, dispatch } = useEditor();
    const [selectedEventKey, setSelectedEventKey] = useState<string>('follow');
    const [codeTab, setCodeTab] = useState<CodeTab>('html');
    const [previewKey, setPreviewKey] = useState(0);
    const [showPresets, setShowPresets] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const config = widget.config;
    const selectedEvent = EVENTS.find(e => e.key === selectedEventKey)!;
    const eventCfg = getAlertEventConfig(config, selectedEventKey);

    // ── Helpers ──

    const updateConfig = useCallback((key: string, value: any) => {
        dispatch({ type: 'UPDATE_WIDGET_CONFIG', payload: { id: widget.id, config: { [key]: value } } });
    }, [dispatch, widget.id]);

    const updateEventCfg = useCallback((eventKey: string, patch: Record<string, any>) => {
        const current = getAlertEventConfig(config, eventKey);
        const events = config.events || {};
        dispatch({
            type: 'UPDATE_WIDGET_CONFIG',
            payload: { id: widget.id, config: { events: { ...events, [eventKey]: { ...current, ...patch } } } },
        });
    }, [dispatch, widget.id, config]);

    const applyPreset = useCallback((p: AlertPreset) => {
        dispatch({
            type: 'UPDATE_WIDGET_CONFIG',
            payload: { id: widget.id, config: { htmlTemplate: p.html, customCss: p.css, customJs: p.js, presetId: p.id } },
        });
        setPreviewKey(k => k + 1);
    }, [dispatch, widget.id]);

    const currentCode =
        codeTab === 'html' ? (config.htmlTemplate ?? DEFAULT_ALERT_HTML) :
        codeTab === 'css'  ? (config.customCss   ?? DEFAULT_ALERT_CSS)   :
                              (config.customJs    ?? DEFAULT_ALERT_JS);

    const handleCodeChange = (value: string) => updateConfig(CODE_KEY[codeTab], value);

    const handleReset = () => {
        updateConfig(CODE_KEY[codeTab], CODE_DEFAULT[codeTab]);
        setPreviewKey(k => k + 1);
    };

    const handleTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        const el = e.currentTarget;
        const s = el.selectionStart;
        const en = el.selectionEnd;
        const next = currentCode.slice(0, s) + '  ' + currentCode.slice(en);
        handleCodeChange(next);
        requestAnimationFrame(() => {
            el.selectionStart = s + 2;
            el.selectionEnd = s + 2;
        });
    };

    const srcDoc = buildAlertSrcDoc(config, selectedEvent.preview);

    // Switch event tab: replay preview animation
    const switchEvent = (key: string) => {
        setSelectedEventKey(key);
        setPreviewKey(k => k + 1);
    };

    // ── Render ──

    return (
        <div
            className="fixed inset-0 z-[2000] bg-[#020305]/90 backdrop-blur-2xl flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="relative w-full max-w-[1160px] bg-[#0a0c10] border border-white/8 rounded-2xl shadow-[0_40px_120px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150" style={{ height: '88vh' }}>

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-brand-primary/15 border border-brand-primary/20 flex items-center justify-center shrink-0">
                            <Bell size={14} className="text-brand-primary" />
                        </div>
                        <div>
                            <h2 className="text-[13px] font-black text-white tracking-tight">Alert Box Editor</h2>
                            <p className="text-[10px] text-zinc-600 mt-0.5">
                                {state.overlay?.name ?? 'Overlay'} — HTML, CSS & JavaScript
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowPresets(true)}
                            className="flex items-center gap-2 h-9 px-3.5 rounded-xl bg-brand-primary/[0.08] hover:bg-brand-primary/15 border border-brand-primary/20 text-brand-primary text-[10px] font-black uppercase tracking-wider transition-colors duration-150 cursor-pointer"
                        >
                            <LayoutGrid size={13} />
                            Presets
                        </button>
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white hover:bg-white/8 transition-colors duration-150 cursor-pointer"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {showPresets && (
                    <PresetGallery
                        activeId={config.presetId}
                        onApply={applyPreset}
                        onClose={() => setShowPresets(false)}
                    />
                )}

                {/* ── Body ── */}
                <div className="flex-1 flex overflow-hidden">

                    {/* ─── LEFT PANEL: Editor ─── */}
                    <div className="flex-1 flex flex-col overflow-hidden min-w-0">

                        {/* Event tabs */}
                        <div className="px-4 pt-3 border-b border-white/5 flex gap-0.5 shrink-0">
                            {EVENTS.map(({ key, label }) => {
                                const cfg = getAlertEventConfig(config, key);
                                const active = selectedEventKey === key;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => switchEvent(key)}
                                        className={`relative flex items-center gap-1.5 px-3.5 py-2.5 text-[10px] font-black uppercase tracking-wider transition-[color,background-color] duration-150 cursor-pointer rounded-t-lg ${
                                            active
                                                ? 'text-white bg-[#0d0f14] border border-b-[#0d0f14] border-white/8 -mb-px z-10'
                                                : 'text-zinc-600 hover:text-zinc-400'
                                        }`}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.enabled ? 'bg-brand-primary' : 'bg-zinc-700'}`} />
                                        {label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Per-event settings bar */}
                        <div className="px-5 py-3 bg-[#0d0f14] border-b border-white/5 flex items-center gap-5 shrink-0 flex-wrap">
                            {/* Enable/disable toggle */}
                            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                <button
                                    role="switch"
                                    aria-checked={eventCfg.enabled}
                                    onClick={() => updateEventCfg(selectedEventKey, { enabled: !eventCfg.enabled })}
                                    className={`relative w-9 h-5 rounded-full border transition-[background-color,border-color] duration-200 cursor-pointer shrink-0 ${
                                        eventCfg.enabled ? 'bg-brand-primary/20 border-brand-primary/40' : 'bg-white/[0.03] border-white/10'
                                    }`}
                                >
                                    <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-[left,background-color] duration-200 shadow-sm ${
                                        eventCfg.enabled ? 'left-[18px] bg-brand-primary' : 'left-0.5 bg-zinc-600'
                                    }`} />
                                </button>
                                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                                    {selectedEvent.label} {eventCfg.enabled ? 'enabled' : 'disabled'}
                                </span>
                            </label>

                            <div className="w-px h-4 bg-white/8" />

                            {/* Duration */}
                            <label className="flex items-center gap-2 cursor-pointer">
                                <Clock size={11} className="text-zinc-600 shrink-0" />
                                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Duration</span>
                                <input
                                    type="number"
                                    step={500}
                                    min={1000}
                                    max={30000}
                                    value={eventCfg.duration}
                                    onChange={(e) => updateEventCfg(selectedEventKey, { duration: Number(e.target.value) })}
                                    className="w-16 bg-white/[0.03] border border-white/8 rounded-lg px-2 py-1 text-[10px] text-white font-bold text-center focus:outline-none focus:border-brand-primary/50 transition-[border-color] duration-150 tabular-nums"
                                />
                                <span className="text-[10px] text-zinc-600">ms</span>
                            </label>

                            {/* Min amount (condition) */}
                            {selectedEvent.hasAmount && (
                                <>
                                    <div className="w-px h-4 bg-white/8" />
                                    <label className="flex items-center gap-2">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-600">{selectedEvent.amountLabel}</span>
                                        <input
                                            type="number"
                                            min={0}
                                            value={eventCfg.minAmount ?? 0}
                                            onChange={(e) => updateEventCfg(selectedEventKey, { minAmount: Number(e.target.value) || undefined })}
                                            className="w-16 bg-white/[0.03] border border-white/8 rounded-lg px-2 py-1 text-[10px] text-white font-bold text-center focus:outline-none focus:border-brand-primary/50 transition-[border-color] duration-150 tabular-nums"
                                        />
                                        <span className="text-[9px] text-zinc-600">(0 = no limit)</span>
                                    </label>
                                </>
                            )}

                            <div className="w-px h-4 bg-white/8" />

                            {/* Alert sound */}
                            <label className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Sound</span>
                                <SoundPicker
                                    sound={eventCfg.sound}
                                    onChange={(sound) => updateEventCfg(selectedEventKey, { sound })}
                                />
                            </label>
                        </div>

                        {/* Variations — bigger events get their own sound/duration + {variant} */}
                        {selectedEvent.hasAmount && (
                            <VariationsPanel
                                amountLabel={selectedEvent.amountLabel ?? 'Min amount'}
                                variations={eventCfg.variations ?? []}
                                onChange={(variations) => updateEventCfg(selectedEventKey, { variations })}
                            />
                        )}

                        {/* Code editor area */}
                        <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
                            {/* Code tabs + reset */}
                            <div className="flex items-center gap-2 shrink-0">
                                <div className="flex bg-white/[0.02] border border-white/5 rounded-xl p-1 gap-0.5">
                                    {(['html', 'css', 'js'] as CodeTab[]).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setCodeTab(t)}
                                            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-[background-color,color] duration-150 cursor-pointer ${
                                                codeTab === t ? 'bg-brand-primary text-[#05070a]' : 'text-zinc-600 hover:text-zinc-400'
                                            }`}
                                        >
                                            {t.toUpperCase()}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex-1" />

                                <div className="flex items-center gap-1.5 text-[9px] text-zinc-700 px-2">
                                    <Info size={10} className="shrink-0" />
                                    Shared template — use JS to customise per event
                                </div>

                                <button
                                    onClick={handleReset}
                                    title={`Reset ${codeTab.toUpperCase()} to default`}
                                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.02] border border-white/5 text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-[background-color,color] duration-150 cursor-pointer"
                                    aria-label="Reset to default"
                                >
                                    <RotateCcw size={12} />
                                </button>
                            </div>

                            {/* Code textarea — flex-1 fills remaining space */}
                            <textarea
                                ref={textareaRef}
                                spellCheck={false}
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                className="flex-1 w-full bg-[#020304] border border-white/[0.06] rounded-xl px-4 py-4 text-[11px] leading-[1.7] text-zinc-300 font-mono resize-none focus:outline-none focus:border-brand-primary/25 transition-[border-color] duration-150 custom-scrollbar min-h-0"
                                style={{ tabSize: 2, fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',Consolas,monospace" }}
                                value={currentCode}
                                onChange={(e) => handleCodeChange(e.target.value)}
                                onKeyDown={handleTabKey}
                                placeholder={CODE_PLACEHOLDER[codeTab]}
                            />

                            {/* Variable chips */}
                            <div className="shrink-0 flex items-center gap-2 flex-wrap">
                                <span className="text-[9px] font-black text-zinc-700 uppercase tracking-widest shrink-0">Variables</span>
                                <div className="w-px h-3 bg-white/[0.06]" />
                                {VARIABLES.map(({ v, desc }) => (
                                    <button
                                        key={v}
                                        title={desc}
                                        onClick={() => {
                                            const el = textareaRef.current;
                                            if (el) {
                                                const s = el.selectionStart;
                                                const en = el.selectionEnd;
                                                const next = currentCode.slice(0, s) + v + currentCode.slice(en);
                                                handleCodeChange(next);
                                                requestAnimationFrame(() => {
                                                    el.selectionStart = s + v.length;
                                                    el.selectionEnd = s + v.length;
                                                    el.focus();
                                                });
                                            } else {
                                                handleCodeChange(currentCode + v);
                                            }
                                        }}
                                        className="text-[10px] font-mono font-bold text-brand-primary bg-brand-primary/[0.07] hover:bg-brand-primary hover:text-[#05070a] px-2 py-0.5 rounded-md border border-brand-primary/15 transition-[background-color,color] duration-150 cursor-pointer"
                                    >
                                        {v}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ─── RIGHT PANEL: Preview ─── */}
                    <div className="w-[360px] shrink-0 flex flex-col bg-[#070910] border-l border-white/5 overflow-hidden">

                        {/* Preview header */}
                        <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
                            <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                                Preview — {selectedEvent.label}
                            </span>
                            <button
                                onClick={() => setPreviewKey(k => k + 1)}
                                title="Replay animation"
                                className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-zinc-700 hover:text-zinc-400 transition-colors duration-150 cursor-pointer"
                            >
                                <RefreshCw size={10} />
                                Replay
                            </button>
                        </div>

                        {/* Preview iframe — fills remaining space */}
                        <div className="flex-1 flex items-center justify-center p-5 min-h-0">
                            <div
                                className="w-full rounded-xl overflow-hidden border border-white/[0.06] bg-transparent"
                                style={{
                                    aspectRatio: `${widget.width} / ${widget.height}`,
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                }}
                            >
                                <ScaledAlertFrame
                                    frameKey={`${selectedEventKey}-${previewKey}`}
                                    srcDoc={srcDoc}
                                    widgetWidth={widget.width}
                                    widgetHeight={widget.height}
                                    title={`${selectedEvent.label} alert preview`}
                                />
                            </div>
                        </div>

                        {/* Test + info */}
                        <div className="px-5 pb-5 pt-4 space-y-3 shrink-0 border-t border-white/5">
                            <TestButton widget={widget} event={selectedEvent} />

                            <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-3 flex gap-2.5">
                                <Info size={11} className="text-zinc-700 mt-0.5 shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-[9px] text-zinc-600 leading-relaxed">
                                        HTML, CSS and JS are <strong className="text-zinc-500">shared</strong> across all event types.
                                        Use <code className="text-brand-primary/60 font-mono">window.alertData.type</code> in JavaScript to render differently per event.
                                    </p>
                                    <p className="text-[9px] text-zinc-700">
                                        Preview uses sample data. Click "Test" to fire a live alert.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── TestButton ─────────────────────────────────────────────────────────────

function TestButton({ widget, event }: { widget: Widget; event: typeof EVENTS[number] }) {
    const { state } = useEditor();
    const [firing, setFiring] = useState(false);
    const [amount, setAmount] = useState<string>('');

    const handleTest = async () => {
        if (!state.overlay?.id || firing) return;
        setFiring(true);
        try {
            const body: AlertData = { ...event.preview };
            if (event.hasAmount && amount.trim() !== '' && Number.isFinite(Number(amount))) {
                body.amount = Number(amount);
            }
            await fetch(apiUrl(`/api/overlays/${state.overlay.id}/test-alert`), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        } finally {
            setTimeout(() => setFiring(false), 1500);
        }
    };

    return (
        <div className="flex items-stretch gap-2">
            {event.hasAmount && (
                <input
                    type="number"
                    min={0}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={String(event.preview.amount ?? 0)}
                    title="Amount to test with (fires matching variations)"
                    className="w-20 bg-white/[0.03] border border-white/8 rounded-xl px-2 text-[11px] text-white font-bold text-center focus:outline-none focus:border-brand-primary/50 transition-[border-color] duration-150 tabular-nums"
                />
            )}
            <button
                onClick={handleTest}
                disabled={firing}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-[background-color,border-color,color,opacity] duration-150 border ${
                    firing
                        ? 'bg-brand-primary/5 border-brand-primary/10 text-brand-primary/40 cursor-not-allowed'
                        : 'bg-brand-primary/[0.08] hover:bg-brand-primary/15 border-brand-primary/20 text-brand-primary cursor-pointer'
                }`}
            >
                <Zap size={12} className={firing ? 'animate-pulse' : ''} />
                {firing ? 'Sending…' : `Test ${event.label} alert`}
            </button>
        </div>
    );
}

// ── SoundPicker ────────────────────────────────────────────────────────────

function SoundPicker({ sound, onChange }: { sound: AlertSound | null | undefined; onChange: (s: AlertSound | null) => void }) {
    const [busy, setBusy] = useState(false);

    const upload = async (file: File) => {
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch(apiUrl('/api/overlays/upload'), { method: 'POST', credentials: 'include', body: fd });
            if (!res.ok) {
                alert((await res.json().catch(() => ({}))).error || 'Upload failed');
                return;
            }
            const { url } = await res.json();
            onChange({ url, volume: sound?.volume ?? 0.8 });
        } finally {
            setBusy(false);
        }
    };

    if (!sound?.url) {
        return (
            <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-white/[0.03] border border-white/8 text-zinc-500 hover:text-zinc-300 text-[10px] font-bold px-2.5 py-1 transition-colors duration-150">
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
                {busy ? 'Uploading…' : '+ Upload'}
            </label>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5">
            <button
                onClick={() => { try { const a = new Audio(sound.url); a.volume = Math.min(1, Math.max(0, sound.volume ?? 0.8)); void a.play().catch(() => undefined); } catch { /* bad URL */ } }}
                title="Preview sound"
                className="px-2 py-1 rounded-lg bg-white/[0.03] border border-white/8 text-zinc-400 hover:text-white text-[10px] font-bold transition-colors duration-150 cursor-pointer"
            >
                ▶
            </button>
            <input
                type="range"
                min={0}
                max={100}
                value={Math.round((sound.volume ?? 0.8) * 100)}
                onChange={(e) => onChange({ ...sound, volume: Number(e.target.value) / 100 })}
                title={`Volume ${Math.round((sound.volume ?? 0.8) * 100)}%`}
                className="w-16 accent-brand-primary"
            />
            <button
                onClick={() => onChange(null)}
                title="Remove sound"
                className="p-1 rounded text-zinc-600 hover:text-rose-400 transition-colors duration-150 cursor-pointer"
            >
                <X size={10} />
            </button>
        </span>
    );
}

// ── VariationsPanel ────────────────────────────────────────────────────────

function VariationsPanel({
    amountLabel,
    variations,
    onChange,
}: {
    amountLabel: string;
    variations: AlertVariation[];
    onChange: (v: AlertVariation[]) => void;
}) {
    const update = (i: number, patch: Partial<AlertVariation>) =>
        onChange(variations.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));

    return (
        <div className="px-5 py-2.5 bg-[#0a0c11] border-b border-white/5 shrink-0 space-y-1.5">
            <div className="flex items-center gap-3">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
                    Variations {variations.length > 0 && <span className="text-brand-primary">({variations.length})</span>}
                </span>
                <span className="text-[9px] text-zinc-700">bigger amounts can override sound & duration — highest match wins</span>
                <div className="flex-1" />
                <button
                    onClick={() => onChange([...variations, { name: `Big ${variations.length + 1}`, minAmount: 100 }].slice(0, 8))}
                    disabled={variations.length >= 8}
                    className="text-[9px] font-black uppercase tracking-wider text-brand-primary hover:underline disabled:opacity-40 cursor-pointer"
                >
                    + Add
                </button>
            </div>
            {variations.map((v, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                    <input
                        value={v.name}
                        onChange={(e) => update(i, { name: e.target.value.slice(0, 40) })}
                        placeholder="Name"
                        title="Exposed to the template as {variant}"
                        className="w-28 bg-white/[0.03] border border-white/8 rounded-lg px-2 py-1 text-[10px] text-white font-bold focus:outline-none focus:border-brand-primary/50 transition-[border-color] duration-150"
                    />
                    <label className="flex items-center gap-1 text-[9px] text-zinc-600 font-bold">
                        {amountLabel} ≥
                        <input
                            type="number"
                            min={0}
                            value={v.minAmount ?? 0}
                            onChange={(e) => update(i, { minAmount: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-16 bg-white/[0.03] border border-white/8 rounded-lg px-2 py-1 text-[10px] text-white font-bold text-center focus:outline-none focus:border-brand-primary/50 transition-[border-color] duration-150 tabular-nums"
                        />
                    </label>
                    <label className="flex items-center gap-1 text-[9px] text-zinc-600 font-bold">
                        ms
                        <input
                            type="number"
                            step={500}
                            min={1000}
                            max={30000}
                            value={v.duration ?? ''}
                            onChange={(e) => update(i, { duration: e.target.value === '' ? undefined : Number(e.target.value) })}
                            placeholder="default"
                            title="Duration override (blank = event default)"
                            className="w-16 bg-white/[0.03] border border-white/8 rounded-lg px-2 py-1 text-[10px] text-white font-bold text-center focus:outline-none focus:border-brand-primary/50 transition-[border-color] duration-150 tabular-nums"
                        />
                    </label>
                    <SoundPicker sound={v.sound} onChange={(sound) => update(i, { sound })} />
                    <button
                        onClick={() => onChange(variations.filter((_, idx) => idx !== i))}
                        title="Delete variation"
                        className="p-1 rounded text-zinc-600 hover:text-rose-400 transition-colors duration-150 cursor-pointer"
                    >
                        <X size={11} />
                    </button>
                </div>
            ))}
        </div>
    );
}

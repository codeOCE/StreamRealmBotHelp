"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    CircleDollarSign,
    Copy,
    CreditCard,
    ExternalLink,
    LayoutDashboard,
    Search,
    Shield,
    Sparkles,
    Trash2,
} from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { connectRealtime } from '@/lib/realtime';
import { toast } from 'sonner';
import { FeaturePage } from '@/components/dashboard/FeatureUI';
import { VoidToggle } from '@/components/dashboard/VoidToggle';
import { VoidSelect } from '@/components/dashboard/VoidSelect';
import { cn } from '@/lib/utils';
import { TIP_CURRENCIES } from '@/lib/tip-currencies';
import { speakTipMessage } from '@/lib/tts';

type Tab = 'page' | 'payments' | 'moderation' | 'activity';
type FilterAction = 'allow' | 'replace' | 'hide_message' | 'block_alert';

interface Settings {
    enabled: boolean;
    currency: string;
    minAmountCents: number;
    maxAmountCents: number | null;
    suggestedAmountCents: number;
    maxMessageLength: number;
    tipPresets: number[];
    thanksMessage: string;
    stripeAccountId: string | null;
    stripeConnected: boolean;
    paypalEmail: string | null;
    paypalConnected: boolean;
    profanityEnabled: boolean;
    customBlockedWords: string[];
    blockedDonors: string[];
    filterAction: FilterAction;
    replacementText: string;
    manualApproval: boolean;
    ttsAntiSpam: boolean;
    ttsEnabled: boolean;
    ttsMinAmountCents: number;
    ttsMonthlyCharLimit: number;
    ttsCharsUsed: number;
    pollyReady: boolean;
}

interface Tip {
    id: string;
    donorName: string;
    amountCents: number;
    currency: string;
    message: string;
    rawMessage?: string;
    status: string;
    provider: string;
    createdAt: string;
    alertSuppressed?: boolean;
    moderationStatus?: string | null;
    moderationReason?: string | null;
}

interface LeaderRow {
    donorName: string;
    totalCents: number;
    tipCount: number;
}

const BASE = apiUrl('/api/tips');

const DEFAULT_SETTINGS: Settings = {
    enabled: true,
    currency: 'USD',
    minAmountCents: 100,
    maxAmountCents: null,
    suggestedAmountCents: 500,
    maxMessageLength: 255,
    tipPresets: [5, 10, 25, 50],
    thanksMessage: 'Thank you so much for the support!',
    stripeAccountId: null,
    stripeConnected: false,
    paypalEmail: null,
    paypalConnected: false,
    profanityEnabled: true,
    customBlockedWords: [],
    blockedDonors: [],
    filterAction: 'replace',
    replacementText: '***',
    manualApproval: false,
    ttsAntiSpam: true,
    ttsEnabled: false,
    ttsMinAmountCents: 100,
    ttsMonthlyCharLimit: 50_000,
    ttsCharsUsed: 0,
    pollyReady: false,
};

function normalizeSettings(raw: Partial<Settings> | null | undefined): Settings {
    if (!raw) return { ...DEFAULT_SETTINGS };
    return {
        ...DEFAULT_SETTINGS,
        ...raw,
        tipPresets: Array.isArray(raw.tipPresets) && raw.tipPresets.length > 0
            ? raw.tipPresets
            : DEFAULT_SETTINGS.tipPresets,
        customBlockedWords: Array.isArray(raw.customBlockedWords) ? raw.customBlockedWords : DEFAULT_SETTINGS.customBlockedWords,
        blockedDonors: Array.isArray(raw.blockedDonors) ? raw.blockedDonors : DEFAULT_SETTINGS.blockedDonors,
    };
}

const TABS: { id: Tab; label: string }[] = [
    { id: 'page', label: 'Page settings' },
    { id: 'payments', label: 'Payment methods' },
    { id: 'moderation', label: 'Moderation' },
    { id: 'activity', label: 'Activity' },
];

const FILTER_ACTIONS: { value: FilterAction; label: string }[] = [
    { value: 'replace', label: 'Replace bad words' },
    { value: 'hide_message', label: 'Hide message on alert' },
    { value: 'block_alert', label: 'Block alert entirely' },
    { value: 'allow', label: 'Allow (no filtering)' },
];

function fmtMoney(currency: string, cents: number) {
    return `${currency} ${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string) {
    try {
        return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return iso;
    }
}

function providerLabel(p: string) {
    if (p === 'stripe') return 'Card';
    if (p === 'paypal') return 'PayPal';
    if (p === 'manual') return 'Manual';
    return p;
}

export default function TipsPage() {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [tips, setTips] = useState<Tip[]>([]);
    const [pendingReview, setPendingReview] = useState<Tip[]>([]);
    const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
    const [totalCents, setTotalCents] = useState(0);
    const [stripeReady, setStripeReady] = useState(false);
    const [streamerId, setStreamerId] = useState('');
    const [channel, setChannel] = useState('');
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<Tab>('page');
    const [search, setSearch] = useState('');
    const [presetDraft, setPresetDraft] = useState('');
    const [blockedWordsDraft, setBlockedWordsDraft] = useState('');
    const [blockedDonorsDraft, setBlockedDonorsDraft] = useState('');
    const [ttsTesting, setTtsTesting] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const load = async (silent = false) => {
        try {
            const res = await fetch(BASE, { credentials: 'include' });
            const r = await res.json().catch(() => ({}));
            if (!res.ok) {
                setLoadError(r.message || 'Could not load tipping settings');
                if (!settings) setSettings({ ...DEFAULT_SETTINGS });
            } else {
                setLoadError(null);
                const next = normalizeSettings(r.settings);
                setSettings(next);
                setPresetDraft(next.tipPresets.join(', '));
                setBlockedWordsDraft(next.customBlockedWords.join('\n'));
                setBlockedDonorsDraft(next.blockedDonors.join('\n'));
            }
            setTips(Array.isArray(r.tips) ? r.tips : []);
            setPendingReview(Array.isArray(r.pendingReview) ? r.pendingReview : []);
            setLeaderboard(Array.isArray(r.leaderboard) ? r.leaderboard : []);
            setTotalCents(r.totalCents ?? 0);
            setStripeReady(!!r.stripeReady);
        } catch {
            setLoadError('Could not reach the tips API');
            if (!settings) setSettings({ ...DEFAULT_SETTINGS });
        }
    };

    useEffect(() => {
        (async () => {
            setLoading(true);
            const me = await fetch(apiUrl('/api/user/me'), { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
            setStreamerId(me?.tenantId ?? me?.id ?? '');
            setChannel((me?.username ?? me?.login ?? '').toLowerCase());
            await load();
            setLoading(false);
        })();
    }, []);

    useEffect(() => {
        if (!streamerId) return;
        return connectRealtime(`tips:${streamerId}`, (event) => { if (event === 'tip') void load(true); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streamerId]);

    const s = settings ?? DEFAULT_SETTINGS;
    const cur = s.currency;
    const fmt = (cents: number) => fmtMoney(cur, cents);
    const tipUrl = channel && typeof window !== 'undefined' ? `${window.location.origin}/tip/${channel}` : '';

    const completedTips = useMemo(() => tips.filter((t) => t.status === 'completed'), [tips]);
    const tipCount = completedTips.length;
    const avgCents = tipCount > 0 ? Math.round(totalCents / tipCount) : 0;

    const filteredTips = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return tips;
        return tips.filter(
            (t) =>
                t.donorName.toLowerCase().includes(q) ||
                t.message.toLowerCase().includes(q) ||
                providerLabel(t.provider).toLowerCase().includes(q),
        );
    }, [tips, search]);

    const saveSettings = async (patch: Partial<Settings> & { tipPresets?: number[] }) => {
        const res = await fetch(`${BASE}/settings`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
        });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) {
            toast.error(r.message || 'Could not save settings');
            return;
        }
        if (r.settings) {
            setSettings(normalizeSettings(r.settings));
            setPresetDraft(normalizeSettings(r.settings).tipPresets.join(', '));
            toast.success('Saved');
        }
    };

    const savePresetsFromDraft = () => {
        const nums = presetDraft
            .split(/[,;\s]+/)
            .map((s) => Math.trunc(Number(s)))
            .filter((n) => n >= 1);
        if (nums.length === 0) {
            toast.error('Add at least one preset amount');
            return;
        }
        void saveSettings({ tipPresets: nums.slice(0, 8) });
    };

    const copyTipLink = async () => {
        if (!tipUrl) return;
        try {
            await navigator.clipboard.writeText(tipUrl);
            toast.success('Tip link copied');
        } catch {
            toast.error('Could not copy link');
        }
    };

    const remove = async (id: string) => {
        if (!confirm('Delete this tip record?')) return;
        await fetch(`${BASE}/${id}`, { method: 'DELETE', credentials: 'include' });
        setTips((xs) => xs.filter((t) => t.id !== id));
        setPendingReview((xs) => xs.filter((t) => t.id !== id));
        toast.success('Tip removed');
    };

    const reviewTip = async (id: string, action: 'approve' | 'deny') => {
        const res = await fetch(`${BASE}/${id}/${action}`, { method: 'POST', credentials: 'include' });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) {
            toast.error(r.message || `Could not ${action} tip`);
            return;
        }
        toast.success(action === 'approve' ? 'Approved' : 'Denied');
        await load(true);
    };

    const saveWordList = (field: 'customBlockedWords' | 'blockedDonors', draft: string) => {
        const list = draft
            .split(/[\n,;]+/)
            .map((w) => w.trim().toLowerCase())
            .filter((w) => w.length >= 2)
            .slice(0, 200);
        void saveSettings({ [field]: list });
    };

    const testTipTts = async () => {
        setTtsTesting(true);
        try {
            await speakTipMessage('', 'This is a test tip message.');
            toast.success('Played');
            await load(true);
        } catch {
            toast.error('Could not play TTS in this browser');
        } finally {
            setTtsTesting(false);
        }
    };

    const inputClass = 'void-input w-full text-sm';

    return (
        <FeaturePage>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0">
                        <CircleDollarSign className="w-5 h-5 text-brand-primary" strokeWidth={2.25} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white font-heading tracking-tight">Tipping</h1>
                        <p className="text-sm text-zinc-500">Tip page, payments, activity.</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {tipUrl && (
                        <>
                            <button type="button" onClick={copyTipLink} className="saas-button-secondary !text-xs inline-flex items-center gap-2 h-10">
                                <Copy className="size-3.5" /> Copy tip link
                            </button>
                            <a href={tipUrl} target="_blank" rel="noreferrer" className="saas-button !text-xs inline-flex items-center gap-2 h-10">
                                <ExternalLink className="size-3.5" /> Open tip page
                            </a>
                        </>
                    )}
                </div>
            </div>

            {/* Tip page URL bar */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="text-[10px] font-bold  text-zinc-600 shrink-0">Your tipping page</p>
                <input readOnly value={tipUrl} className={`${inputClass} flex-1 !bg-transparent !border-0 !px-0 font-mono text-xs text-zinc-400`} />
                <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(
                        'text-[10px] font-bold  px-2.5 py-1 rounded-full border',
                        settings?.enabled ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-zinc-500 border-white/10 bg-white/[0.03]',
                    )}>
                        {s.enabled ? 'Live' : 'Paused'}
                    </span>
                </div>
            </div>

            <div className="flex gap-6 border-b border-white/[0.06] mb-6 overflow-x-auto">
                {TABS.map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        className={cn(
                            'pb-3 text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer border-b-2 -mb-px inline-flex items-center gap-2',
                            tab === id ? 'text-white border-brand-primary' : 'text-zinc-500 border-transparent hover:text-zinc-300',
                        )}
                    >
                        {id === 'moderation' && <Shield className="size-3.5" />}
                        {label}
                        {id === 'moderation' && pendingReview.length > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {pendingReview.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {loadError && (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
                    {loadError}. Using defaults.
                </div>
            )}

            {loading ? (
                <div className="space-y-3">
                    <div className="skeleton h-32 w-full rounded-xl" />
                    <div className="skeleton h-48 w-full rounded-xl" />
                </div>
            ) : (
                <>
                    {tab === 'page' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" key={`page-${s.currency}-${s.minAmountCents}`}>
                            <div className="lg:col-span-2 space-y-6">
                                <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-5">
                                    <h2 className="text-sm font-bold text-white">General</h2>
                                    <label className="flex items-center justify-between gap-4">
                                        <p className="text-sm font-semibold text-zinc-200">Accept tips</p>
                                        <VoidToggle
                                            checked={s.enabled}
                                            onChange={(enabled) => saveSettings({ enabled })}
                                            aria-label="Accept tips"
                                        />
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <label className="block space-y-1.5">
                                            <span className="text-[10px] font-bold  text-zinc-600">Currency</span>
                                            <VoidSelect
                                                value={s.currency}
                                                onChange={(e) => saveSettings({ currency: e.target.value })}
                                            >
                                                {TIP_CURRENCIES.map((c) => (
                                                    <option key={c.code} value={c.code}>{c.label}</option>
                                                ))}
                                            </VoidSelect>
                                        </label>
                                        <label className="block space-y-1.5">
                                            <span className="text-[10px] font-bold  text-zinc-600">Thank-you message</span>
                                            <input defaultValue={s.thanksMessage} onBlur={(e) => saveSettings({ thanksMessage: e.target.value })} className={inputClass} />
                                        </label>
                                    </div>
                                </section>

                                <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-5">
                                    <h2 className="text-sm font-bold text-white">Tip TTS</h2>
                                    <label className="flex items-center justify-between gap-4">
                                        <p className="text-sm font-semibold text-zinc-200">Enable TTS</p>
                                        <VoidToggle
                                            checked={s.ttsEnabled}
                                            onChange={(ttsEnabled) => saveSettings({ ttsEnabled })}
                                            aria-label="Enable tip TTS"
                                        />
                                    </label>
                                    <label className="block space-y-1.5 max-w-xs">
                                        <span className="text-[10px] font-bold  text-zinc-600">Min amount ({cur})</span>
                                        <input
                                            type="number"
                                            min={0}
                                            step={0.5}
                                            defaultValue={(s.ttsMinAmountCents / 100).toFixed(2)}
                                            onBlur={(e) => saveSettings({ ttsMinAmountCents: Math.round(Number(e.target.value) * 100) })}
                                            className={inputClass}
                                            disabled={!s.ttsEnabled}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => void testTipTts()}
                                        disabled={ttsTesting}
                                        className="saas-button-secondary !text-xs"
                                    >
                                        {ttsTesting ? 'Playing…' : 'Test TTS'}
                                    </button>
                                </section>

                                <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-5">
                                    <h2 className="text-sm font-bold text-white">Amounts</h2>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <label className="block space-y-1.5">
                                            <span className="text-[10px] font-bold  text-zinc-600">Minimum ({cur})</span>
                                            <input
                                                type="number"
                                                min={0.5}
                                                step={0.5}
                                                defaultValue={(s.minAmountCents / 100).toFixed(2)}
                                                onBlur={(e) => saveSettings({ minAmountCents: Math.round(Number(e.target.value) * 100) })}
                                                className={inputClass}
                                            />
                                        </label>
                                        <label className="block space-y-1.5">
                                            <span className="text-[10px] font-bold  text-zinc-600">Maximum ({cur})</span>
                                            <input
                                                type="number"
                                                min={0.5}
                                                step={1}
                                                placeholder="No limit"
                                                defaultValue={s.maxAmountCents ? (s.maxAmountCents / 100).toFixed(2) : ''}
                                                onBlur={(e) => {
                                                    const raw = e.target.value.trim();
                                                    saveSettings({
                                                        maxAmountCents: raw ? Math.round(Number(raw) * 100) : null,
                                                    });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                        <label className="block space-y-1.5">
                                            <span className="text-[10px] font-bold  text-zinc-600">Suggested amount ({cur})</span>
                                            <input
                                                type="number"
                                                min={0.5}
                                                step={1}
                                                defaultValue={(s.suggestedAmountCents / 100).toFixed(2)}
                                                onBlur={(e) => saveSettings({ suggestedAmountCents: Math.round(Number(e.target.value) * 100) })}
                                                className={inputClass}
                                            />
                                        </label>
                                        <label className="block space-y-1.5">
                                            <span className="text-[10px] font-bold  text-zinc-600">Max message length</span>
                                            <input
                                                type="number"
                                                min={20}
                                                max={500}
                                                defaultValue={s.maxMessageLength}
                                                onBlur={(e) => saveSettings({ maxMessageLength: Number(e.target.value) })}
                                                className={inputClass}
                                            />
                                        </label>
                                    </div>
                                </section>

                                <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
                                    <h2 className="text-sm font-bold text-white">Presets</h2>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {s.tipPresets.map((p) => (
                                            <span key={p} className="px-3 py-1.5 rounded-lg bg-brand-primary/10 border border-brand-primary/20 text-sm font-bold text-brand-primary">
                                                {cur} {p}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            value={presetDraft}
                                            onChange={(e) => setPresetDraft(e.target.value)}
                                            placeholder="5, 10, 25, 50"
                                            className={inputClass}
                                        />
                                        <button type="button" onClick={savePresetsFromDraft} className="saas-button !px-4 shrink-0">
                                            Save
                                        </button>
                                    </div>
                                </section>
                            </div>

                            <aside className="space-y-4">
                                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <Sparkles className="size-4 text-brand-primary" />
                                        Alerts
                                    </h3>
                                    <Link href="/dashboard/overlays" className="saas-button-secondary w-full inline-flex items-center justify-center gap-2 !text-xs h-10">
                                        <LayoutDashboard className="size-3.5" />
                                        Open overlays
                                    </Link>
                                </div>
                            </aside>
                        </div>
                    )}

                    {tab === 'moderation' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" key={`mod-${s.manualApproval}-${s.filterAction}`}>
                            <div className="lg:col-span-2 space-y-6">
                                <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-5">
                                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                        <Shield className="size-4 text-brand-primary" />
                                        Filters
                                    </h2>
                                    <label className="flex items-center justify-between gap-4">
                                        <p className="text-sm font-semibold text-zinc-200">Profanity filter</p>
                                        <VoidToggle
                                            checked={s.profanityEnabled}
                                            onChange={(profanityEnabled) => saveSettings({ profanityEnabled })}
                                            aria-label="Profanity filter"
                                        />
                                    </label>
                                    <label className="flex items-center justify-between gap-4">
                                        <p className="text-sm font-semibold text-zinc-200">Spam filter</p>
                                        <VoidToggle
                                            checked={s.ttsAntiSpam}
                                            onChange={(ttsAntiSpam) => saveSettings({ ttsAntiSpam })}
                                            aria-label="Message spam filter"
                                        />
                                    </label>
                                    <label className="flex items-center justify-between gap-4">
                                        <p className="text-sm font-semibold text-zinc-200">Manual approval</p>
                                        <VoidToggle
                                            checked={s.manualApproval}
                                            onChange={(manualApproval) => saveSettings({ manualApproval })}
                                            aria-label="Manual approval"
                                        />
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <label className="block space-y-1.5">
                                            <span className="text-[10px] font-bold  text-zinc-600">When flagged</span>
                                            <VoidSelect
                                                value={s.filterAction}
                                                onChange={(e) => saveSettings({ filterAction: e.target.value as FilterAction })}
                                            >
                                                {FILTER_ACTIONS.map((o) => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                ))}
                                            </VoidSelect>
                                        </label>
                                        <label className="block space-y-1.5">
                                            <span className="text-[10px] font-bold  text-zinc-600">Replacement text</span>
                                            <input
                                                defaultValue={s.replacementText}
                                                onBlur={(e) => saveSettings({ replacementText: e.target.value || '***' })}
                                                className={inputClass}
                                                disabled={s.filterAction !== 'replace'}
                                            />
                                        </label>
                                    </div>
                                </section>

                                <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
                                    <h2 className="text-sm font-bold text-white">Blocked words</h2>
                                    <textarea
                                        value={blockedWordsDraft}
                                        onChange={(e) => setBlockedWordsDraft(e.target.value)}
                                        rows={5}
                                        className={`${inputClass} resize-y min-h-[100px]`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => saveWordList('customBlockedWords', blockedWordsDraft)}
                                        className="saas-button !text-xs !px-4"
                                    >
                                        Save word list
                                    </button>
                                </section>

                                <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
                                    <h2 className="text-sm font-bold text-white">Blocked donors</h2>
                                    <textarea
                                        value={blockedDonorsDraft}
                                        onChange={(e) => setBlockedDonorsDraft(e.target.value)}
                                        rows={4}
                                        className={`${inputClass} resize-y min-h-[80px]`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => saveWordList('blockedDonors', blockedDonorsDraft)}
                                        className="saas-button !text-xs !px-4"
                                    >
                                        Save blocked donors
                                    </button>
                                </section>
                            </div>

                            <aside className="space-y-4">
                                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
                                    <h3 className="text-sm font-bold text-white">Pending review</h3>
                                    {pendingReview.length === 0 ? (
                                        <p className="text-xs text-zinc-600 text-center py-6">None pending.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {pendingReview.map((t) => (
                                                <div key={t.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-white truncate">{t.donorName}</p>
                                                            <p className="text-xs text-brand-primary font-bold tabular-nums">{fmtMoney(t.currency, t.amountCents)}</p>
                                                        </div>
                                                        <span className="text-[10px] text-zinc-500 shrink-0">{fmtDate(t.createdAt)}</span>
                                                    </div>
                                                    {(t.rawMessage || t.message) && (
                                                        <p className="text-xs text-zinc-500 line-clamp-3">{t.rawMessage || t.message}</p>
                                                    )}
                                                    {t.moderationReason && (
                                                        <p className="text-[10px] text-amber-400/90">{t.moderationReason}</p>
                                                    )}
                                                    <div className="flex gap-2 pt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => reviewTip(t.id, 'approve')}
                                                            className="saas-button flex-1 !text-xs !py-2"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => reviewTip(t.id, 'deny')}
                                                            className="saas-button-secondary flex-1 !text-xs !py-2 !text-rose-300"
                                                        >
                                                            Deny
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </aside>
                        </div>
                    )}

                    {tab === 'payments' && (
                        <div className="space-y-5 max-w-4xl" key={`pay-${s.stripeAccountId ?? 'x'}-${s.paypalEmail ?? 'x'}`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 rounded-lg bg-[#635bff]/15 border border-[#635bff]/25 flex items-center justify-center">
                                            <CreditCard className="size-5 text-[#a5a0ff]" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white">Card payments</h3>
                                        </div>
                                    </div>
                                    <span className={cn(
                                        'text-[10px] font-bold  px-2 py-1 rounded-full border',
                                        stripeReady && s.stripeConnected
                                            ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                                            : stripeReady
                                                ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
                                                : 'text-zinc-500 border-white/10',
                                    )}>
                                        {!stripeReady ? 'Not configured' : s.stripeConnected ? 'Connected' : 'Platform only'}
                                    </span>
                                </div>
                                <label className="block space-y-1.5">
                                    <span className="text-[10px] font-bold  text-zinc-600">Stripe Connect ID</span>
                                    <input
                                        defaultValue={s.stripeAccountId ?? ''}
                                        onBlur={(e) => saveSettings({ stripeAccountId: e.target.value || null })}
                                        placeholder="acct_…"
                                        className={inputClass}
                                    />
                                </label>
                            </div>

                            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 rounded-lg bg-[#0070ba]/15 border border-[#0070ba]/25 flex items-center justify-center text-[#0070ba] font-black text-xs">
                                            PP
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white">PayPal</h3>
                                        </div>
                                    </div>
                                    <span className={cn(
                                        'text-[10px] font-bold  px-2 py-1 rounded-full border',
                                        s.paypalConnected
                                            ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                                            : 'text-zinc-500 border-white/10',
                                    )}>
                                        {s.paypalConnected ? 'Linked' : 'Not linked'}
                                    </span>
                                </div>
                                <label className="block space-y-1.5">
                                    <span className="text-[10px] font-bold  text-zinc-600">PayPal email</span>
                                    <input
                                        type="email"
                                        defaultValue={s.paypalEmail ?? ''}
                                        onBlur={(e) => saveSettings({ paypalEmail: e.target.value || null })}
                                        placeholder="you@example.com"
                                        className={inputClass}
                                    />
                                </label>
                            </div>
                            </div>

                            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
                                <h3 className="text-sm font-bold text-white">Checklist</h3>
                                <ul className="text-xs text-zinc-500 space-y-2">
                                    <li className={stripeReady ? 'text-emerald-400/90' : ''}>
                                        {stripeReady ? '✓' : '○'} Platform Stripe keys configured
                                    </li>
                                    <li className={s.stripeConnected ? 'text-emerald-400/90' : ''}>
                                        {s.stripeConnected ? '✓' : '○'} Your Stripe Connect account linked
                                    </li>
                                    <li className={s.paypalConnected ? 'text-emerald-400/90' : ''}>
                                        {s.paypalConnected ? '✓' : '○'} PayPal email saved
                                    </li>
                                    <li className={s.enabled ? 'text-emerald-400/90' : ''}>
                                        {s.enabled ? '✓' : '○'} Tipping enabled on your page
                                    </li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {tab === 'activity' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="stat-card holo-card">
                                    <p className="text-[10px] font-black  text-zinc-500">Total raised</p>
                                    <p className="text-2xl font-black text-white mt-2 tabular-nums">{fmt(totalCents)}</p>
                                </div>
                                <div className="stat-card holo-card">
                                    <p className="text-[10px] font-black  text-zinc-500">Tips</p>
                                    <p className="text-2xl font-black text-white mt-2 tabular-nums">{tipCount}</p>
                                </div>
                                <div className="stat-card holo-card">
                                    <p className="text-[10px] font-black  text-zinc-500">Average tip</p>
                                    <p className="text-2xl font-black text-white mt-2 tabular-nums">{tipCount ? fmt(avgCents) : '—'}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-2 space-y-4">
                                    <div className="relative max-w-sm">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-600 pointer-events-none" />
                                        <input
                                            type="search"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder="Search activity…"
                                            className="w-full h-10 bg-white/[0.03] border border-white/8 rounded-lg pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-brand-primary/40"
                                        />
                                    </div>

                                    <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                                        <table className="w-full text-left border-collapse min-w-[640px]">
                                            <thead>
                                                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                                                    <th className="px-4 py-3 text-[10px] font-semibold  text-zinc-500">Date</th>
                                                    <th className="px-4 py-3 text-[10px] font-semibold  text-zinc-500">Donor</th>
                                                    <th className="px-4 py-3 text-[10px] font-semibold  text-zinc-500">Amount</th>
                                                    <th className="px-4 py-3 text-[10px] font-semibold  text-zinc-500">Message</th>
                                                    <th className="px-4 py-3 text-[10px] font-semibold  text-zinc-500">Method</th>
                                                    <th className="w-12 px-4 py-3" />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredTips.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-500">
                                                            {search ? 'No tips match your search.' : 'No tips yet — share your tip link to get started.'}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredTips.map((t) => (
                                                        <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                                                            <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                                                            <td className="px-4 py-3 text-sm font-semibold text-white">{t.donorName}</td>
                                                            <td className="px-4 py-3 text-sm text-brand-primary font-bold tabular-nums">{fmtMoney(t.currency, t.amountCents)}</td>
                                                            <td className="px-4 py-3 text-xs text-zinc-500 max-w-[200px] truncate">{t.message || '—'}</td>
                                                            <td className="px-4 py-3">
                                                                <span className="text-[10px] font-bold  text-zinc-500 bg-white/[0.04] px-2 py-1 rounded border border-white/[0.06]">
                                                                    {providerLabel(t.provider)}
                                                                </span>
                                                                {t.status !== 'completed' && (
                                                                    <span className="ml-1 text-[10px] text-amber-400">{t.status}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => remove(t.id)}
                                                                    className="p-2 rounded-md text-zinc-600 hover:text-rose-400 transition-colors cursor-pointer"
                                                                    aria-label="Delete tip"
                                                                >
                                                                    <Trash2 className="size-4" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
                                    <h3 className="text-sm font-bold text-white mb-4">Top supporters</h3>
                                    {leaderboard.length === 0 ? (
                                        <p className="text-xs text-zinc-600 text-center py-6">No supporters yet.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {leaderboard.map((r, i) => (
                                                <div key={i} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                                                    <span className="text-sm text-white font-semibold truncate">
                                                        <span className="text-brand-primary mr-2 tabular-nums">#{i + 1}</span>
                                                        {r.donorName}
                                                    </span>
                                                    <span className="text-xs text-zinc-400 font-bold tabular-nums shrink-0">{fmt(r.totalCents)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </FeaturePage>
    );
}

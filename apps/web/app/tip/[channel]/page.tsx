"use client";

import { Suspense, use, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Heart, ArrowLeft } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { toast } from 'sonner';

interface TipConfig {
    channel: string; displayName: string; avatarUrl: string | null;
    enabled: boolean; currency: string; minAmountCents: number;
    maxAmountCents: number | null; suggestedAmountCents: number;
    maxMessageLength: number; tipPresets: number[];
    thanksMessage: string; stripeReady: boolean; paypalReady?: boolean;
}

const FALLBACK_PRESETS = [5, 10, 25, 50];

export default function TipPage({ params }: { params: Promise<{ channel: string }> }) {
    return (
        <Suspense fallback={<TipShell><div className="skeleton h-96 w-full max-w-md rounded-[2.5rem]" /></TipShell>}>
            <TipPageInner params={params} />
        </Suspense>
    );
}

function TipPageInner({ params }: { params: Promise<{ channel: string }> }) {
    const { channel } = use(params);
    const search = useSearchParams();
    const status = search.get('status');

    const [cfg, setCfg] = useState<TipConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [amount, setAmount] = useState(5);
    const [donorName, setDonorName] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    const min = cfg ? Math.max(0.5, cfg.minAmountCents / 100) : 0.5;
    const max = cfg?.maxAmountCents ? cfg.maxAmountCents / 100 : null;
    const presets = useMemo(() => {
        if (!cfg) return FALLBACK_PRESETS.filter((p) => p >= min);
        const fromCfg = (cfg.tipPresets?.length ? cfg.tipPresets : FALLBACK_PRESETS).filter((p) => p >= min);
        if (max != null) return fromCfg.filter((p) => p <= max);
        return fromCfg;
    }, [cfg, min, max]);

    useEffect(() => {
        (async () => {
            const res = await fetch(apiUrl(`/api/tip/${encodeURIComponent(channel)}`)).catch(() => null);
            if (!res || !res.ok) { setNotFound(true); setLoading(false); return; }
            const data = (await res.json()) as TipConfig;
            setCfg(data);
            const floor = Math.max(0.5, data.minAmountCents / 100);
            const suggested = Math.max(floor, (data.suggestedAmountCents ?? 500) / 100);
            const capped = data.maxAmountCents ? Math.min(suggested, data.maxAmountCents / 100) : suggested;
            setAmount(capped);
            setLoading(false);
        })();
    }, [channel]);

    const tip = async () => {
        if (!cfg) return;
        setFormError('');
        setSubmitting(true);
        try {
            const res = await fetch(apiUrl(`/api/tip/${encodeURIComponent(channel)}/checkout`), {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ donorName: donorName.trim() || 'Anonymous', message: message.trim(), amountCents: Math.round(amount * 100) }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg = data.message || 'Could not start checkout';
                setFormError(msg);
                toast.error(msg);
                return;
            }
            if (data.url) window.location.href = data.url;
        } finally { setSubmitting(false); }
    };

    if (loading) return <TipShell><div className="skeleton h-96 w-full max-w-md rounded-[2.5rem]" /></TipShell>;
    if (notFound || !cfg) return <TipShell><p className="text-zinc-500 font-bold">Channel not found.</p></TipShell>;

    if (status === 'cancelled') {
        return (
            <TipShell>
                <div className="tip-card p-12 text-center max-w-md w-full">
                    <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center">
                        <ArrowLeft className="w-6 h-6 text-zinc-400" />
                    </div>
                    <h1 className="text-2xl font-black text-white mb-3 font-heading">Checkout cancelled</h1>
                    <p className="text-zinc-400 text-sm">No charge was made.</p>
                    <a href={`/tip/${encodeURIComponent(channel)}`} className="saas-button inline-flex mt-8">Try again</a>
                </div>
            </TipShell>
        );
    }

    if (status === 'success') {
        return (
            <TipShell>
                <div className="tip-card border-brand-primary/30 p-12 text-center max-w-md w-full glow-p">
                    <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
                        <Heart className="w-8 h-8 text-brand-primary fill-brand-primary/20" />
                    </div>
                    <h1 className="text-3xl font-black text-white mb-3 font-heading">Thank you!</h1>
                    <p className="text-zinc-400">{cfg.thanksMessage}</p>
                    <a href={`/tip/${encodeURIComponent(channel)}`} className="saas-button inline-flex mt-8">Send another</a>
                </div>
            </TipShell>
        );
    }

    const cur = cfg.currency;

    return (
        <TipShell>
            <form className="tip-card p-10 max-w-md w-full space-y-7" onSubmit={(e) => { e.preventDefault(); tip(); }}>
                <div className="flex flex-col items-center text-center gap-4">
                    {cfg.avatarUrl ? (
                        <div className="avatar-ring">
                            <img src={cfg.avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover" />
                        </div>
                    ) : (
                        <div className="w-20 h-20 rounded-full bg-brand-primary/10 border border-brand-primary/25 flex items-center justify-center">
                            <Heart className="w-8 h-8 text-brand-primary" />
                        </div>
                    )}
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-primary mb-1">Support</p>
                        <h1 className="text-2xl font-black text-white font-heading">{cfg.displayName}</h1>
                        <p className="text-zinc-500 text-sm mt-1.5">Your tip pops up live on stream.</p>
                    </div>
                </div>

                {!cfg.enabled ? (
                    <p className="text-center text-amber-300/80 bg-amber-400/10 border border-amber-400/20 rounded-xl py-3 px-4 text-sm font-semibold">
                        {cfg.displayName} isn&apos;t accepting tips right now.
                    </p>
                ) : (
                    <>
                        <div className={`grid gap-2 ${presets.length >= 4 ? 'grid-cols-4' : presets.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {(presets.length ? presets : [min]).map((p) => (
                                <button
                                    type="button"
                                    key={p}
                                    onClick={() => setAmount(p)}
                                    className={`py-3.5 rounded-xl font-black text-sm border transition-all duration-200 cursor-pointer ${amount === p ? 'bg-brand-primary text-[#05070a] border-brand-primary shadow-glow-p scale-[1.02]' : 'bg-white/[0.03] text-zinc-300 border-white/10 hover:border-brand-primary/40'}`}
                                >
                                    {cur} {p}
                                </button>
                            ))}
                        </div>

                        <label className="block space-y-1.5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Custom amount ({cur})</span>
                            <input type="number" min={min} max={max ?? undefined} step={1} value={amount} onChange={(e) => {
                                let v = Math.max(min, Number(e.target.value) || min);
                                if (max != null) v = Math.min(max, v);
                                setAmount(v);
                            }} className="void-input w-full text-lg font-black" />
                        </label>
                        <label className="block space-y-1.5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Your name</span>
                            <input value={donorName} onChange={(e) => setDonorName(e.target.value)} placeholder="Anonymous" className="void-input w-full" />
                        </label>
                        <label className="block space-y-1.5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Message (optional)</span>
                            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={cfg.maxMessageLength ?? 200} placeholder="Say something nice…" className="void-input w-full resize-none" />
                        </label>

                        {formError && (
                            <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl py-2.5 px-4">{formError}</p>
                        )}

                        {cfg.stripeReady ? (
                            <button type="submit" disabled={submitting} className="saas-button w-full h-14 text-base disabled:opacity-50">
                                {submitting ? 'Redirecting…' : `Tip ${cur} ${amount.toFixed(2)}`}
                            </button>
                        ) : (
                            <p className="text-center text-zinc-500 bg-white/[0.03] border border-white/10 rounded-xl py-3 px-4 text-sm">
                                Card tips aren&apos;t set up for this creator yet.
                            </p>
                        )}
                        <p className="text-center text-[10px] text-zinc-600">Secure checkout via Stripe · min {cur} {min.toFixed(2)}</p>
                    </>
                )}
            </form>
        </TipShell>
    );
}

function TipShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative">
            <div className="tip-page-bg" aria-hidden />
            {children}
        </div>
    );
}

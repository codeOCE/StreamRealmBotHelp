"use client";

import React, { useState, useEffect } from 'react';
import { Bot, Link2, Unlink, RefreshCw, CheckCircle2, AlertCircle, ChevronRight, Power, PowerOff, ShieldCheck, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const API_BASE = '/api/integrations';

export default function IntegrationsPage() {
    const [tenant, setTenant] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

    const fetchTenantStatus = async () => {
        try {
            // First, fetch the current user to get their tenant ID
            const userRes = await fetch('/api/user/me', { credentials: 'include' }).catch(err => null);
            if (!userRes || !userRes.ok) {
                console.warn('User fetch failed or unauthorized');
                setTenant(null);
                setIsLoading(false);
                return;
            }
            const userData = await userRes.json();

            if (!userData.tenantId) {
                // No tenant yet, user needs to authenticate
                setTenant(null);
                setIsLoading(false);
                return;
            }

            // Fetch onboarding status to check initialization progress
            const statusRes = await fetch(`/api/dashboard/onboarding/${userData.tenantId}`);
            if (!statusRes.ok) throw new Error('Failed to fetch status');
            const statusData = await statusRes.json();

            setTenant({
                id: userData.tenantId,
                name: userData.tenantName || userData.username,
                isConnected: userData.isConnected,
                botUsername: statusData.botUsername || null,
                hasTokens: statusData.hasLinkedBot || false
            });
        } catch (err) {
            console.error('Failed to fetch status', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTenantStatus();
    }, []);

    const handleBotAction = async (action: 'join' | 'leave' | 'unlink') => {
        if (!tenant?.id) {
            toast.error('Terminal context not found');
            return;
        }

        setIsActionLoading(action);
        try {
            const res = await fetch(`${API_BASE}/bot/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenantId: tenant.id }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message);
                // Slight delay before refresh to allow backend tasks to complete
                setTimeout(fetchTenantStatus, 1000);
            } else {
                toast.error(data.error || 'Protocol error');
            }
        } catch (err) {
            console.error('Bot action error:', err);
            toast.error('Uplink connection failed');
        } finally {
            setIsActionLoading(null);
        }
    };

    const platforms = [
        {
            id: 'twitch',
            name: 'Twitch',
            description: 'Core Sentinel interface for Twitch chat, moderation, and alerts.',
            icon: 'T',
            status: tenant?.isConnected ? 'ONLINE' : (tenant?.hasTokens ? 'STANDBY' : 'DISCONNECTED'),
            color: 'from-[#9146FF]/20 to-[#772CE8]/20',
            borderColor: 'border-[#9146FF]/30',
            active: true
        },
        {
            id: 'kick',
            name: 'Kick',
            description: 'Direct integration for Kick.com streaming presence.',
            icon: 'K',
            status: 'COMING SOON',
            color: 'from-[#53FC18]/10 to-[#53FC18]/5',
            borderColor: 'border-[#53FC18]/10',
            active: false
        },
        {
            id: 'youtube',
            name: 'YouTube',
            description: 'Automated moderation and engagement for YouTube Live.',
            icon: 'Y',
            status: 'COMING SOON',
            color: 'from-[#FF0000]/10 to-[#FF0000]/5',
            borderColor: 'border-[#FF0000]/10',
            active: false
        }
    ];

    return (
        <div className="p-8 space-y-10 max-w-7xl mx-auto animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-brand-primary rounded-full shadow-[0_0_12px_rgba(var(--brand-primary-rgb),0.6)]" />
                    <h1 className="text-3xl font-black tracking-tight text-white uppercase italic">Sentinel Presence</h1>
                </div>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-[0.2em] ml-5 italic">Coordinate cross-platform bot activity and protocol status</p>
            </div>

            {/* Platform Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {platforms.map((p) => (
                    <div key={p.id} className={cn(
                        "glass-card p-1 relative overflow-hidden group rounded-[2.5rem] border transition-all duration-500",
                        p.active
                            ? "border-brand-primary/20 bg-brand-primary/[0.02]"
                            : "border-white/[0.05] opacity-50 grayscale"
                    )}>
                        <div className="p-8 space-y-8 relative z-10">
                            <div className="flex justify-between items-start">
                                <div className={cn(
                                    "w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center text-2xl font-black text-white shadow-xl shadow-black/20 border mb-4",
                                    p.color,
                                    p.borderColor
                                )}>
                                    {p.icon}
                                </div>
                                <div className={cn(
                                    "px-4 py-1.5 rounded-full border flex items-center gap-2",
                                    p.status === 'ONLINE' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                                        p.status === 'STANDBY' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                                            'bg-zinc-500/10 border-white/5 text-zinc-500'
                                )}>
                                    {p.status === 'ONLINE' && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                                    <span className="text-[10px] font-black uppercase tracking-widest leading-none">{p.status}</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">{p.name} Presence</h2>
                                <p className="text-sm text-zinc-500 font-medium leading-relaxed">{p.description}</p>
                            </div>

                            {p.active ? (
                                <div className="pt-4 space-y-4">
                                    <div className="flex gap-3">
                                        {tenant?.isConnected ? (
                                            <button
                                                onClick={() => handleBotAction('leave')}
                                                disabled={isActionLoading === 'leave'}
                                                className="flex-1 py-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                                            >
                                                <PowerOff className="w-4 h-4" /> Deactivate Protocol
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleBotAction('join')}
                                                disabled={isActionLoading === 'join'}
                                                className="flex-1 py-4 rounded-2xl bg-brand-primary text-white font-black text-[10px] uppercase tracking-[0.2em] hover:shadow-[0_0_25px_rgba(var(--brand-primary-rgb),0.4)] transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                                            >
                                                <Zap className="w-4 h-4 fill-current" /> Initialize Sentinel
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleBotAction('unlink')}
                                        disabled={isActionLoading === 'unlink'}
                                        className="w-full py-4 px-6 rounded-2xl bg-white/[0.03] border border-white/10 text-zinc-500 font-black text-[10px] uppercase tracking-widest hover:bg-white/5 hover:text-white transition-all flex items-center justify-center gap-3"
                                    >
                                        <Unlink className="w-4 h-4" /> Relink Protocol Interface
                                    </button>
                                </div>
                            ) : (
                                <div className="pt-8 flex items-center justify-center">
                                    <div className="px-6 py-3 rounded-2xl border border-white/5 bg-white/[0.02] text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">
                                        Expansion Pending
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Bottom Info Strip */}
            <div className="glass-card p-8 rounded-[2rem] border border-white/[0.05] bg-slate-900/40 backdrop-blur-md flex flex-col md:flex-row items-center gap-8 shadow-2xl">
                <div className="w-20 h-20 rounded-3xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shadow-inner">
                    <ShieldCheck className="w-10 h-10" />
                </div>
                <div className="flex-1 text-center md:text-left space-y-2">
                    <h4 className="text-xs font-black text-brand-primary uppercase tracking-[0.3em] italic">Data Integrity Protocol</h4>
                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider leading-relaxed max-w-2xl">
                        Deactivating or relinking the Sentinel protocol will <span className="text-white">never</span> delete your command registry, analytics data, or member profiles. It only manages the bot's existence within your stream chat.
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Global Status</p>
                        <p className="text-xl font-black text-white italic uppercase tracking-tighter">Synchronized</p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-brand-primary/20 border border-brand-primary/40 flex items-center justify-center text-brand-primary animate-pulse">
                        <Zap className="w-6 h-6 fill-current" />
                    </div>
                </div>
            </div>
        </div>
    );
}


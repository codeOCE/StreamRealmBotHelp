"use client";

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bot, Link2, Unlink, RefreshCw, CheckCircle2, AlertCircle, ChevronRight, Trash2 } from 'lucide-react';
import Link from 'next/link';

const API_BASE = 'http://localhost:3001/integrations';

export default function IntegrationsPage() {
    const searchParams = useSearchParams();
    const [integrations, setIntegrations] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnecting, setIsConnecting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(searchParams.get('error'));
    const [success, setSuccess] = useState<boolean>(searchParams.get('success') === 'true');

    useEffect(() => {
        fetchIntegrations();
    }, []);

    const fetchIntegrations = async () => {
        try {
            const res = await fetch(API_BASE);
            const data = await res.json();
            setIntegrations(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch integrations', err);
            setIntegrations([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUnlink = async (provider: string) => {
        if (!confirm(`Are you sure you want to unlink ${provider}?`)) return;
        try {
            await fetch(`${API_BASE}/${provider}`, { method: 'DELETE' });
            fetchIntegrations();
        } catch (err) {
            console.error('Unlink failed', err);
        }
    };

    const handleConnectOAuth = (provider: string) => {
        // Redirect to backend authorize endpoint
        // We can pass tenantId as a query param if needed, or rely on the backend finding it
        window.location.href = `http://localhost:3001/integrations/authorize/${provider}`;
    };

    const providers = [
        {
            id: 'nightbot',
            name: 'Nightbot',
            description: 'Link your Nightbot account to sync custom commands and variables.',
            icon: 'N',
            color: 'from-red-500/20 to-red-600/20',
            borderColor: 'border-red-500/20'
        },
        {
            id: 'se',
            name: 'StreamElements',
            description: 'Professional command migration and real-time element synchronization.',
            icon: 'SE',
            color: 'from-blue-500/20 to-blue-600/20',
            borderColor: 'border-blue-500/20'
        }
    ];

    return (
        <div className="p-8 space-y-10 max-w-7xl mx-auto animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-brand-primary rounded-full shadow-[0_0_12px_rgba(var(--brand-primary-rgb),0.6)]" />
                    <h1 className="text-3xl font-black tracking-tight text-white uppercase italic">Integration Center</h1>
                </div>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-[0.2em] ml-5">Connect and coordinate your streaming ecosystem</p>
            </div>

            {/* Status Messages */}
            {(success || error) && (
                <div className={`p-4 rounded-xl border flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 ${success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'}`}>
                    <span className="text-lg">{success ? '✅' : '⚠️'}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">
                        {success ? 'Integration successfully linked!' : `Error: ${error}`}
                    </span>
                </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {providers.map((p) => {
                    const active = Array.isArray(integrations) ? integrations.find(i => i.provider === p.id) : null;
                    return (
                        <div key={p.id} className={`glass-card p-1 relative overflow-hidden group rounded-3xl border transition-all duration-500 ${active ? 'border-brand-primary/20 bg-brand-primary/[0.02]' : 'border-white/[0.05] hover:border-white/10'}`}>
                            <div className="p-8 space-y-6 relative z-10">
                                <div className="flex justify-between items-start">
                                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${p.color} border ${p.borderColor} flex items-center justify-center text-xl font-black text-white shadow-inner`}>
                                        {p.icon}
                                    </div>
                                    {active ? (
                                        <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Active Connection</span>
                                        </div>
                                    ) : (
                                        <div className="px-3 py-1 rounded-full bg-zinc-500/10 border border-zinc-500/20 flex items-center gap-2">
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Disconnected</span>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">{p.name}</h2>
                                    <p className="text-xs text-zinc-500 mt-2 font-medium leading-relaxed max-w-[80%]">{p.description}</p>
                                </div>

                                <div className="pt-4 flex gap-4">
                                    {active ? (
                                        <>
                                            <button
                                                onClick={() => handleUnlink(p.id)}
                                                className="flex-1 py-4 rounded-2xl bg-white/[0.03] border border-white/[0.05] text-zinc-400 font-black text-[10px] uppercase tracking-widest hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-500 transition-all flex items-center justify-center gap-2"
                                            >
                                                <Unlink className="w-3 h-3" /> Unlink Service
                                            </button>
                                            <button
                                                className="w-14 h-14 rounded-2xl bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center text-brand-primary hover:bg-brand-primary hover:text-white transition-all shadow-[0_0_20px_rgba(var(--brand-primary-rgb),0.1)] active:scale-95"
                                            >
                                                <RefreshCw className="w-5 h-5" />
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={() => handleConnectOAuth(p.id)}
                                            disabled={isConnecting === p.id}
                                            className="flex-1 py-4 px-6 rounded-2xl bg-brand-primary text-white font-black text-[10px] uppercase tracking-[0.2em] hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-start gap-4 group/btn"
                                        >
                                            {isConnecting === p.id ? 'Establishing...' : `Login with ${p.name}`}
                                            <ChevronRight className="w-4 h-4 ml-auto group-hover/btn:translate-x-1 transition-transform" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Decorative Background Elements */}
                            <div className={`absolute -right-12 -bottom-12 w-48 h-48 bg-gradient-to-br ${p.color} blur-[100px] opacity-0 group-hover:opacity-30 transition-opacity duration-700`} />
                        </div>
                    );
                })}

                {/* Coming Soon card */}
                <div className="glass-card p-1 border-white/[0.03] bg-white/[0.01] rounded-3xl opacity-40 grayscale flex items-center justify-center border-dashed border-2">
                    <div className="text-center p-12">
                        <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                            <Bot className="text-zinc-500 w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">Expansion Pending</span>
                    </div>
                </div>
            </div>

            {/* Bottom Info */}
            <div className="p-8 rounded-3xl bg-amber-500/5 border border-amber-500/10 flex items-center gap-6">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                    <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1 italic">Security & Permissions</h4>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider leading-relaxed">
                        We use industry-standard encryption for all integrated tokens. These are only used to fetch your public configuration data and are never shared.
                    </p>
                </div>
            </div>
        </div>
    );
}

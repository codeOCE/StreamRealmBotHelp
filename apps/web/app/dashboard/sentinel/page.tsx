'use client';

import React, { useState, useEffect } from 'react';
import { fetchJsonDetailed } from '@/lib/api';

interface AuditLog {
    id: string;
    action: string;
    actor: string;
    target?: string;
    metadata: any;
    createdAt: string;
}

function SentinelIcon({ name, className = 'w-6 h-6' }: { name: string; className?: string }) {
    const p = { className, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', strokeWidth: '2', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    switch (name) {
        case 'plus':    return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
        case 'wrench':  return <svg {...p}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>;
        case 'trash':   return <svg {...p}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>;
        case 'timer':   return <svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
        case 'ban':     return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>;
        case 'x':       return <svg {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
        case 'shield':  return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
        case 'radio':   return <svg {...p}><circle cx="12" cy="12" r="2"/><path d="M4.93 4.93a10 10 0 000 14.14"/><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M7.76 7.76a6 6 0 000 8.49"/><path d="M16.24 7.76a6 6 0 010 8.49"/></svg>;
        case 'satellite': return <svg {...p}><path d="M13 7 9 3 3 9l4 4"/><path d="m13 7 3 3-3-3"/><path d="M9 17 5 21"/><path d="m17 13 4-4"/><path d="m18 22 4-4-6-6-4 4 6 6z"/><circle cx="11" cy="11" r="1"/></svg>;
        default:        return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>;
    }
}

const ACTION_THEMES: Record<string, { icon: string, color: string, label: string }> = {
    'COMMAND_ADD':     { icon: 'plus',     color: 'text-brand-primary', label: 'Command Added' },
    'COMMAND_EDIT':    { icon: 'wrench',   color: 'text-brand-primary', label: 'Command Updated' },
    'COMMAND_DELETE':  { icon: 'trash',    color: 'text-rose-500',      label: 'Command Deleted' },
    'TIMEOUT':         { icon: 'timer',    color: 'text-amber-400',     label: 'Timeout' },
    'BAN':             { icon: 'ban',      color: 'text-rose-600',      label: 'Ban' },
    'DELETE':          { icon: 'x',        color: 'text-zinc-500',      label: 'Message Deleted' },
    'SENTINEL_ALERT':  { icon: 'shield',   color: 'text-brand-primary', label: 'Auto-Mod' },
};

export default function SentinelPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [status, setStatus] = useState<'connected' | 'disconnected'>('disconnected');

    useEffect(() => {
        // The serverless Worker has no Socket.io gateway; the moderation feed is
        // polled from /api/audit (bot.audit_logs). Status reflects the last poll.
        let active = true;

        const load = async () => {
            const { data, ok } = await fetchJsonDetailed('/api/audit?limit=50');
            if (!active) return;
            setStatus(ok ? 'connected' : 'disconnected');
            if (ok && Array.isArray(data)) setLogs(data as AuditLog[]);
        };

        load();
        const id = setInterval(load, 8000);

        return () => {
            active = false;
            clearInterval(id);
        };
    }, []);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-start justify-between gap-6 flex-wrap">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-white font-heading">Sentinel</h1>
                    <p className="text-brand-muted text-sm font-medium mt-1">Live moderation and activity log.</p>
                </div>
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/8">
                    <div className={`w-2.5 h-2.5 rounded-full ${status === 'connected' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)] animate-pulse' : 'bg-brand-accent shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`} />
                    <span className="text-[10px] font-black text-white ">{status === 'connected' ? 'Connected' : 'Disconnected'}</span>
                </div>
            </div>

            {/* Logs Feed */}
            <div className="bento-card overflow-hidden group">
                <div className="px-12 py-10 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
                            <SentinelIcon name="satellite" className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tighter font-heading">Activity Feed</h2>
                            <p className="text-[10px] font-black text-zinc-600  leading-none">Real-time moderation events</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="h-0.5 w-24 bg-gradient-to-r from-transparent via-brand-primary/30 to-transparent rounded-full overflow-hidden">
                            <div className="h-full bg-brand-primary w-1/3 animate-shimmer" />
                        </div>
                        <span className="text-[10px] text-zinc-600 font-black ">Last 50 events</span>
                    </div>
                </div>

                <div className="divide-y divide-white/[0.03] custom-scrollbar overflow-y-auto max-h-[75vh]">
                    {logs.length === 0 ? (
                        <div className="p-40 text-center flex flex-col items-center gap-8">
                            <div className="w-32 h-32 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center animate-pulse shadow-2xl text-zinc-700">
                                <SentinelIcon name="radio" className="w-12 h-12 opacity-20" />
                            </div>
                            <div className="space-y-3">
                                <p className="text-zinc-500 font-black text-xs ">Waiting for events...</p>
                                <p className="text-[10px] text-zinc-700 font-black  opacity-60">Connect your bot to start seeing activity here.</p>
                            </div>
                        </div>
                    ) : (
                        logs.map((log) => (
                            <LogItem key={log.id} log={log} />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function LogItem({ log }: { log: AuditLog }) {
    const theme = ACTION_THEMES[log.action] || { icon: 'x', color: 'text-zinc-500', label: log.action };
    const date = new Date(log.createdAt);

    return (
        <div className="group p-10 hover:bg-white/[0.03] transition-colors duration-150 flex items-start gap-10 relative overflow-hidden select-none">
            {/* Hover Side Glow */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-16 w-1 bg-brand-primary scale-y-0 group-hover:scale-y-100 transition-transform duration-700 rounded-r-full" />

            <div className={`flex-shrink-0 w-16 h-16 rounded-[1.5rem] bg-white/[0.03] border border-white/10 flex items-center justify-center group-hover:bg-brand-primary/10 group-hover:border-brand-primary/20 transition-all duration-700 ${theme.color}`}>
                <SentinelIcon name={theme.icon} className="w-7 h-7" />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-5 mb-3">
                    <span className={`text-[11px] font-bold  ${theme.color}`}>
                        {theme.label}
                    </span>
                    <span className="text-zinc-800 font-black text-xs opacity-40">/</span>
                    <span className="text-zinc-600 font-black text-[10px]  tabular-nums">
                        {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                </div>

                <div className="text-xl font-black text-white tracking-tight flex items-center flex-wrap gap-x-4 gap-y-2">
                    <span className="text-brand-primary/90 group-hover:text-brand-primary transition-colors">{log.actor}</span>
                    <span className="text-zinc-700 font-black text-[10px] uppercase tracking-normal not-italic opacity-80">→</span>
                    <span className="px-4 py-1.5 rounded-2xl bg-white/[0.04] border border-white/10 text-[11px] font-semibold text-zinc-300 group-hover:bg-white/[0.08] group-hover:text-white transition-colors">
                        {log.target || 'Core System'}
                    </span>
                </div>

                {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <div className="mt-8 p-8 rounded-[2rem] bg-black/60 border border-white/[0.03] text-[11px] font-mono text-zinc-500 overflow-x-auto shadow-inner group-hover:border-white/10 transition-all duration-700 scrollbar-hide">
                        <pre className="opacity-60 group-hover:opacity-100 transition-opacity leading-relaxed">{JSON.stringify(log.metadata, null, 2)}</pre>
                    </div>
                )}
            </div>

            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-700 translate-x-8 group-hover:translate-x-0">
                <button className="text-[10px] font-black text-zinc-500 hover:text-white uppercase px-8 py-4 rounded-2xl border border-white/10 hover:bg-white/[0.08] hover:border-brand-primary/50 transition-[color,background-color,border-color] duration-150 shadow-2xl tracking-[0.2em] active:scale-95 cursor-pointer" aria-label="Inspect log entry">
                    Inspect
                </button>
            </div>
        </div>
    );
}

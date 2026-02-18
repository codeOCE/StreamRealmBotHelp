'use client';

import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

interface AuditLog {
    id: string;
    action: string;
    actor: string;
    target?: string;
    metadata: any;
    createdAt: string;
}

const ACTION_THEMES: Record<string, { icon: string, color: string, label: string }> = {
    'COMMAND_ADD': { icon: '➕', color: 'text-green-400', label: 'Command Created' },
    'COMMAND_EDIT': { icon: '✏️', color: 'text-blue-400', label: 'Command Updated' },
    'COMMAND_DELETE': { icon: '🗑️', color: 'text-red-400', label: 'Command Removed' },
    'TIMEOUT': { icon: '⏳', color: 'text-orange-400', label: 'User Timed Out' },
    'BAN': { icon: '🚫', color: 'text-red-600', label: 'User Banned' },
    'DELETE': { icon: '✖️', color: 'text-zinc-400', label: 'Message Deleted' },
    'SENTINEL_ALERT': { icon: '🚨', color: 'text-red-500', label: 'Security Alert' },
};

export default function SentinelPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [status, setStatus] = useState<'connected' | 'disconnected'>('disconnected');

    useEffect(() => {
        const API_BASE = '/api/sentinel';
        const socket = io(API_BASE);

        socket.on('connect', () => {
            setStatus('connected');
            // Join tenant room (hardcoded default for now)
            socket.emit('joinTenant', 'default');
        });

        socket.on('disconnect', () => {
            setStatus('disconnected');
        });

        socket.on('auditLogEntry', (log: AuditLog) => {
            setLogs(prev => [log, ...prev].slice(0, 50));
        });

        // Initial fetch
        fetch('/api/audit?tenantId=default', { credentials: 'include' })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                return res.json();
            })
            .then(data => setLogs(data))
            .catch(err => console.error('Failed to fetch logs', err));

        return () => {
            socket.disconnect();
        };
    }, []);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-white">Sentinel Logs</h1>
                    <p className="text-sm text-zinc-500 font-medium">Real-time protocol of all administrative actions.</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.05]">
                    <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
                    <span className="text-[10px] font-black text-white uppercase tracking-wider">{status}</span>
                </div>
            </div>

            {/* Logs Feed */}
            <div className="bg-surface-base border border-white/[0.05] rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-white/[0.05] bg-white/[0.01] flex items-center justify-between">
                    <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        👁️ Live Audit Feed
                    </h2>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase">Showing last 50 events</span>
                </div>

                <div className="divide-y divide-white/[0.03]">
                    {logs.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="text-4xl mb-4 opacity-10">📡</div>
                            <p className="text-zinc-600 font-bold text-sm">Awaiting connection to Sentinel backend...</p>
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
    const theme = ACTION_THEMES[log.action] || { icon: '🔹', color: 'text-zinc-400', label: log.action };
    const date = new Date(log.createdAt);

    return (
        <div className="group p-5 hover:bg-white/[0.02] transition-all flex items-start gap-5">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-lg shadow-inner group-hover:scale-110 transition-transform">
                {theme.icon}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${theme.color}`}>
                        {theme.label}
                    </span>
                    <span className="text-zinc-700 font-bold text-[10px]">•</span>
                    <span className="text-zinc-500 font-bold text-[10px]">
                        {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                </div>

                <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="text-brand-primary">{log.actor}</span>
                    <span className="text-zinc-500 font-medium">performed action on</span>
                    <span className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] text-xs font-black">
                        {log.target || 'System'}
                    </span>
                </div>

                {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <div className="mt-3 p-3 rounded-lg bg-black/40 border border-white/[0.03] text-[11px] font-mono text-zinc-400 overflow-x-auto">
                        <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                    </div>
                )}
            </div>

            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="text-[10px] font-black text-white/40 hover:text-white uppercase px-3 py-1.5 rounded-md border border-white/[0.05] hover:bg-white/[0.05] transition-all">
                    Detail
                </button>
            </div>
        </div>
    );
}

"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (commands: any[]) => void;
}

export default function ImportModal({ isOpen, onClose, onImport }: ImportModalProps) {
    const [rawText, setRawText] = useState('');
    const [parsedCommands, setParsedCommands] = useState<any[]>([]);
    const [error, setError] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [activeBot, setActiveBot] = useState<'none' | 'nightbot' | 'se'>('none');
    const [integrations, setIntegrations] = useState<any[]>([]);

    useEffect(() => {
        if (isOpen) {
            fetchIntegrations();
        }
    }, [isOpen]);

    const fetchIntegrations = async () => {
        try {
            const res = await fetch('http://localhost:3001/integrations');
            const data = await res.json();
            if (Array.isArray(data)) {
                setIntegrations(data);
            } else {
                setIntegrations([]);
            }
        } catch (err) {
            console.error('Failed to fetch integrations', err);
        }
    };

    if (!isOpen) return null;

    const handleParse = () => {
        setIsParsing(true);
        setError('');
        try {
            let data = JSON.parse(rawText);

            // Handle StreamElements format or generic array
            let commands = Array.isArray(data) ? data : (data.commands || []);

            const normalized = commands.map((cmd: any) => ({
                trigger: cmd.trigger || cmd.name || cmd.command,
                responses: cmd.response || cmd.responses || cmd.message || cmd.actions?.[0]?.message || '',
                description: cmd.description || `Imported from external source`,
                userLevel: cmd.userLevel || cmd.enabledPermission || 'VIEWER',
                cooldown: cmd.cooldown || 10,
                source: 'Import'
            })).filter((c: any) => c.trigger && c.responses);

            if (normalized.length === 0) {
                setError('No valid commands found in the provided data.');
            } else {
                setParsedCommands(normalized);
            }
        } catch (err) {
            setError('Invalid JSON format. Please ensure you paste valid code.');
        } finally {
            setIsParsing(false);
        }
    };

    const handleIntegratedSync = async () => {
        setIsParsing(true);
        setError('');
        try {
            const res = await fetch('http://localhost:3001/commands/import/integrated', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bot: activeBot,
                    seChannelId: activeBot === 'se' ? (Array.isArray(integrations) ? integrations.find(i => i.provider === 'se')?.metadata?.channelId : undefined) : undefined
                })
            });
            const data = await res.json();
            if (data.imported > 0) {
                alert(`Successfully synced ${data.imported} commands from your linked ${activeBot} account!`);
                onClose();
            } else {
                setError(`No new commands found on your ${activeBot} account.`);
            }
        } catch (err) {
            setError('Integrated sync failed. Please re-link your account in the Integration Center.');
        } finally {
            setIsParsing(false);
        }
    };

    const handleSubmit = () => {
        if (parsedCommands.length > 0) {
            onImport(parsedCommands);
            onClose();
            setRawText('');
            setParsedCommands([]);
        }
    };

    const activeIntegration = Array.isArray(integrations) ? integrations.find(i => i.provider === activeBot) : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="glass-card w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border-white/[0.05] flex flex-col max-h-[90vh] bg-[#020617]">
                {/* Header */}
                <div className="px-8 py-6 border-b border-white/[0.05] flex justify-between items-center bg-white/[0.01]">
                    <div>
                        <h2 className="text-xl font-black tracking-tight text-white uppercase italic">Command Migration Suite</h2>
                        <p className="text-[10px] text-zinc-500 mt-1 font-bold uppercase tracking-widest italic">Link accounts for instant synchronization</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.03] text-zinc-500 hover:text-white transition-all hover:bg-white/[0.08] border border-white/[0.05]">✕</button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-8">
                    {error && (
                        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-3">
                            ⚠️ {error}
                        </div>
                    )}

                    {/* Bot Selector */}
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { id: 'nightbot', name: 'Nightbot' },
                            { id: 'se', name: 'S-Elements' },
                            { id: 'none', name: 'Manual JSON' }
                        ].map((b) => (
                            <button
                                key={b.id}
                                onClick={() => setActiveBot(b.id as any)}
                                className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 group relative overflow-hidden ${activeBot === b.id ? 'bg-brand-primary/10 border-brand-primary' : 'bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.05]'}`}
                            >
                                <span className={`text-[9px] font-black uppercase tracking-widest relative z-10 ${activeBot === b.id ? 'text-white' : 'text-zinc-500'}`}>{b.name}</span>
                                {Array.isArray(integrations) && integrations.find(i => i.provider === b.id) && (
                                    <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" title="Linked account active" />
                                )}
                            </button>
                        ))}
                    </div>

                    {activeBot !== 'none' ? (
                        <div className="p-8 rounded-2xl bg-white/[0.01] border border-white/[0.05] space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                            {activeIntegration ? (
                                <div className="text-center space-y-6 py-6 border-2 border-dashed border-emerald-500/10 rounded-3xl">
                                    <div className="space-y-2">
                                        <h4 className="text-xl font-black text-white italic uppercase tracking-tighter">Sync Ready</h4>
                                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Connected via official OAuth handshake</p>
                                    </div>
                                    <button
                                        onClick={handleIntegratedSync}
                                        disabled={isParsing}
                                        className="py-4 px-10 bg-emerald-500 text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-30"
                                    >
                                        {isParsing ? 'Syncing...' : `Sync from ${activeBot}`}
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center py-12 space-y-6">
                                    <div className="space-y-2">
                                        <h4 className="text-xl font-black text-white italic uppercase tracking-tighter">Login Required</h4>
                                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-loose">
                                            We now use professional OAuth for secure connections.<br />
                                            Please link your account in the Integration Center.
                                        </p>
                                    </div>
                                    <Link
                                        href="/dashboard/integrations"
                                        className="inline-flex py-4 px-10 bg-brand-primary text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-xl hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20 active:scale-95"
                                    >
                                        Go to Integration Center
                                    </Link>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div className="flex items-center justify-between">
                                <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 underline decoration-brand-primary/50 underline-offset-4">Paste Command Data (JSON)</label>
                            </div>
                            <div className="relative group">
                                <textarea
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-5 py-4 focus:outline-none focus:border-brand-primary/30 transition-all text-xs font-mono min-h-[200px] resize-none text-zinc-300 placeholder:text-zinc-800 custom-scrollbar"
                                    placeholder='[ { "command": "hello", "response": "Hi!" } ]'
                                />
                                {!parsedCommands.length && rawText && (
                                    <button
                                        onClick={handleParse}
                                        disabled={isParsing}
                                        className="absolute bottom-4 right-4 px-4 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-[10px] font-black uppercase tracking-widest text-white hover:bg-brand-primary/20 hover:border-brand-primary/40 transition-all disabled:opacity-50"
                                    >
                                        Analyze Data
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {parsedCommands.length > 0 && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center gap-3">
                                <div className="w-1 h-3 bg-brand-primary rounded-full shadow-[0_0_8px_rgba(var(--brand-primary-rgb),0.5)]" />
                                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Previewing {parsedCommands.length} Identified Commands</h3>
                            </div>

                            <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {parsedCommands.map((cmd, idx) => (
                                    <div key={idx} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-between group hover:bg-white/[0.04] transition-all">
                                        <div className="flex items-center gap-4">
                                            <span className="text-brand-primary font-black text-xs">!{cmd.trigger}</span>
                                            <span className="text-[10px] text-zinc-500 font-bold truncate max-w-[400px] opacity-60 group-hover:opacity-100 transition-opacity">
                                                {Array.isArray(cmd.responses) ? cmd.responses[0] : cmd.responses}
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="px-2 py-0.5 rounded bg-white/[0.05] text-[8px] font-black text-zinc-400 uppercase tracking-widest border border-white/[0.03] group-hover:border-white/10 transition-all">{cmd.userLevel}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-white/[0.05] flex justify-between items-center bg-white/[0.01]">
                    <div className="flex gap-2">
                        {parsedCommands.length > 0 && (
                            <button
                                onClick={() => { setParsedCommands([]); setRawText(''); }}
                                className="text-[9px] font-black uppercase tracking-widest text-rose-500/50 hover:text-rose-500 transition-all"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-zinc-500 font-black text-[10px] uppercase tracking-widest hover:bg-white/[0.08] hover:text-white transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            disabled={parsedCommands.length === 0}
                            onClick={handleSubmit}
                            className="px-8 py-3 bg-brand-primary text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:grayscale"
                        >
                            Import {parsedCommands.length || ''} Commands
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

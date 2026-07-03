"use client";

import React, { useState, useEffect } from 'react';
import { Terminal } from 'lucide-react';
import CommandModal from '../../../components/dashboard/CommandModal';
import ImportModal from '../../../components/dashboard/ImportModal';
import { CommandsTable } from '../../../components/dashboard/CommandInlineRow';
import { toast } from "sonner";
import { apiUrl, fetchJsonDetailed } from '@/lib/api';
import { connectRealtime } from '@/lib/realtime';
import { EmptyState, FeaturePage } from '@/components/dashboard/FeatureUI';
import type { CommandFormData } from '@/lib/command-form-options';
import { cn } from '@/lib/utils';

interface Command {
    id: string;
    trigger: string;
    responses: string[];
    responseType: 'SAY' | 'MENTION' | 'REPLY' | 'WHISPER';
    responseMode?: 'ALL' | 'RANDOM';
    userLevel: string;
    enabled: boolean;
    usages: number;
    isBuiltIn: boolean;
    description?: string;
    category?: string;
    cooldown: number;
    userCooldown?: number;
    aliases?: string[];
    isRegex?: boolean;
}

export default function CommandsPage() {
    const [commands, setCommands] = useState<Command[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'custom' | 'built-in'>('custom');
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showNewRow, setShowNewRow] = useState(false);
    const [streamerId, setStreamerId] = useState('');
    const [copied, setCopied] = useState(false);

    const [isModalOpen] = useState(false);
    const [editingCommand] = useState<Command | undefined>(undefined);

    const API_BASE = apiUrl('/api/commands');

    const fetchCommands = async (silent = false) => {
        try {
            if (!silent) setIsLoading(true);
            const { data, error } = await fetchJsonDetailed('/api/commands');
            if (Array.isArray(data)) {
                setCommands(data);
            } else {
                const message = error ?? 'Commands API did not return a list.';
                console.error('Failed to fetch commands:', message, data);
                if (!silent) toast.error(message);
                setCommands([]);
            }
        } catch (error) {
            console.error('Failed to fetch commands', error);
            if (!silent) toast.error('Could not load commands.');
            setCommands([]);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCommands();
        let disconnect: (() => void) | null = null;
        (async () => {
            try {
                const res = await fetch(apiUrl('/api/user/me'), { credentials: 'include' });
                if (!res.ok) return;
                const me = await res.json();
                setStreamerId(me?.tenantId ?? me?.id ?? '');
                disconnect = connectRealtime(`streamer:${me.tenantId}`, (event) => {
                    if (event === 'commandUpdated') fetchCommands(true);
                });
            } catch { /* realtime is best-effort */ }
        })();
        return () => { if (disconnect) disconnect(); };
    }, []);

    const handleSave = async (commandData: Partial<Command> & { id?: string }) => {
        if (commandData.id) {
            const res = await fetch(`${API_BASE}/${commandData.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(commandData),
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Update failed');
            const saved = (await res.json()) as Command;
            setCommands((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
        } else {
            const res = await fetch(API_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(commandData),
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Create failed');
            const saved = (await res.json()) as Command;
            setCommands((prev) => [...prev, saved]);
        }
        toast.success(commandData.id ? 'Command saved.' : 'Command created.');
    };

    const handleInlineSave = async (data: CommandFormData & { id?: string }) => {
        const key = data.id ?? 'new';
        setSavingId(key);
        try {
            await handleSave(data);
            if (!data.id) {
                setShowNewRow(false);
                setExpandedId(null);
            }
        } catch (err) {
            console.error('Failed to save command', err);
            toast.error('Could not save command.');
        } finally {
            setSavingId(null);
        }
    };

    const handleDeleteAll = async () => {
        if (!confirm('Are you sure you want to DELETE ALL custom commands? This cannot be undone.')) return;
        try {
            const res = await fetch(`${API_BASE}/bulk`, { method: 'DELETE', credentials: 'include' });
            if (res.ok) {
                const result = await res.json();
                setCommands((prev) => prev.filter((c) => c.isBuiltIn));
                toast.success(`Deleted ${result.count} commands.`);
            } else {
                toast.error('Failed to delete commands.');
            }
        } catch (err) {
            console.error('Failed to delete all commands', err);
            toast.error('Failed to delete commands.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this command?')) return;
        try {
            await fetch(`${API_BASE}/${id}`, { method: 'DELETE', credentials: 'include' });
            if (expandedId === id) setExpandedId(null);
            setCommands((prev) => prev.filter((c) => c.id !== id));
            toast.success('Command deleted.');
        } catch (err) {
            console.error('Failed to delete command', err);
            toast.error('Could not delete command.');
        }
    };

    const toggleCommand = async (id: string, enabled: boolean) => {
        if (togglingId) return;
        setTogglingId(id);
        try {
            const res = await fetch(`${API_BASE}/${id}/toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled }),
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Toggle failed');
            setCommands((prev) => prev.map((c) => (c.id === id ? { ...c, enabled } : c)));
        } catch (err) {
            console.error('Failed to toggle command', err);
            toast.error('Could not update command.');
        } finally {
            setTogglingId(null);
        }
    };

    const handleImport = async (importCommands: unknown[], dataType: 'commands' | 'timers' | 'points') => {
        // Timers/points are already saved by the wizard itself; this page only
        // shows commands, so just refresh state for that case and leave the rest alone.
        if (dataType !== 'commands') {
            toast.success(`Import complete! Your ${dataType} are now live.`);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commands: importCommands }),
                credentials: 'include',
            });
            const results = await res.json();
            if (results.error) {
                toast.error(results.error);
                return;
            }
            toast.success(`Import complete! Imported: ${results.imported}, Skipped: ${results.skipped}`);
            if (results.errors > 0) toast.warning(`${results.errors} errors occurred during import`);
            await fetchCommands(true);
        } catch (err) {
            console.error('Failed to import commands', err);
            toast.error('Import failed. Check console for details.');
        }
    };

    const customCommands = commands.filter((c) => !c.isBuiltIn);
    const builtInCommands = commands.filter((c) => c.isBuiltIn);
    const activeCommands = activeTab === 'custom' ? customCommands : builtInCommands;

    return (
        <FeaturePage>
            <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0">
                        <Terminal className="w-5 h-5 text-brand-primary" strokeWidth={2.25} />
                    </div>
                    <h1 className="text-xl font-bold text-white font-heading tracking-tight">Commands</h1>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setIsImportModalOpen(true)} className="saas-button-secondary !text-xs">
                        Import
                    </button>
                    {activeTab === 'custom' && customCommands.length > 0 && (
                        <button type="button" onClick={handleDeleteAll} className="saas-button-danger !text-xs">
                            Delete all
                        </button>
                    )}
                </div>
            </div>

            {streamerId && (
                <div className="glass-card rounded-2xl p-4 border border-white/5 flex items-center gap-3 mb-6">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black  text-zinc-400">Public command list link</p>
                        <p className="text-xs text-zinc-500 truncate">Share so viewers can see what they can type in chat</p>
                    </div>
                    <button
                        onClick={() => {
                            navigator.clipboard?.writeText(`${window.location.origin}/commands/${streamerId}`);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                        }}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-brand-primary/15 text-brand-primary border border-brand-primary/20 hover:bg-brand-primary/25 transition-colors shrink-0"
                    >
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                </div>
            )}

            {/* Category tabs */}
            <div className="flex gap-6 border-b border-white/[0.06] mb-6">
                {([
                    { id: 'custom' as const, label: 'Custom commands' },
                    { id: 'built-in' as const, label: 'Default commands' },
                ]).map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => {
                            setActiveTab(id);
                            setExpandedId(null);
                            setShowNewRow(false);
                        }}
                        className={cn(
                            'pb-3 text-sm font-semibold transition-colors cursor-pointer border-b-2 -mb-px',
                            activeTab === id
                                ? 'text-white border-brand-primary'
                                : 'text-zinc-500 border-transparent hover:text-zinc-300',
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {activeTab === 'custom' || builtInCommands.length > 0 ? (
                <CommandsTable
                    commands={activeCommands}
                    readOnly={activeTab === 'built-in'}
                    isLoading={isLoading}
                    togglingId={togglingId}
                    savingId={savingId}
                    expandedId={expandedId}
                    showNew={showNewRow && activeTab === 'custom'}
                    onExpand={setExpandedId}
                    onShowNew={setShowNewRow}
                    onSave={handleInlineSave}
                    onDelete={activeTab === 'custom' ? handleDelete : undefined}
                    onToggle={toggleCommand}
                />
            ) : (
                !isLoading && (
                    <EmptyState
                        icon={Terminal}
                        title="No built-in commands"
                        description="Built-in commands will appear here."
                    />
                )
            )}

            <CommandModal
                isOpen={isModalOpen}
                onClose={() => {}}
                onSave={handleSave}
                initialData={editingCommand}
            />

            <ImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImport={handleImport}
            />
        </FeaturePage>
    );
}

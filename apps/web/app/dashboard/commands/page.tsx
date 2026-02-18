"use client";

import React, { useState, useEffect } from 'react';
import CommandModal from '../../../components/dashboard/CommandModal';
import ImportModal from '../../../components/dashboard/ImportModal';
import { io } from 'socket.io-client';
import { toast } from "sonner";

interface Command {
    id: string;
    trigger: string;
    responses: string[];
    responseType: 'SAY' | 'MENTION' | 'REPLY' | 'WHISPER';
    userLevel: string;
    enabled: boolean;
    usages: number;
    isBuiltIn: boolean;
    description?: string;
    category?: string;
    cooldown: number;
    aliases?: string[];
}

export default function CommandsPage() {
    const [commands, setCommands] = useState<Command[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [editingCommand, setEditingCommand] = useState<Command | undefined>(undefined);
    const [activeCategory, setActiveCategory] = useState<'custom' | 'built-in'>('custom');

    const API_BASE = '/api/commands';
    const SOCKET_URL = '/';

    const fetchCommands = async () => {
        try {
            setIsLoading(true);
            const res = await fetch(API_BASE, { credentials: 'include' });
            const data = await res.json();

            if (Array.isArray(data)) {
                setCommands(data);
            } else {
                console.error('API did not return an array:', data);
                setCommands([]);
            }
        } catch (error) {
            console.error('Failed to fetch commands', error);
            setCommands([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCommands();

        // Socket.io initialization via proxied path
        const socket = io(SOCKET_URL, { path: '/api/socket.io' });

        socket.on('connect', () => {
            console.log('Connected to WebSocket server');
        });

        socket.on('commandUpdated', (data: { tenantId: string }) => {
            console.log('Command update detected via WebSocket:', data);
            fetchCommands();
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const handleSave = async (commandData: Partial<Command>) => {
        try {
            if (editingCommand) {
                await fetch(`${API_BASE}/${editingCommand.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(commandData),
                    credentials: 'include',
                });
            } else {
                await fetch(API_BASE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(commandData),
                    credentials: 'include',
                });
            }
            fetchCommands();
            setIsModalOpen(false);
        } catch (err) {
            console.error('Failed to save command', err);
        }
    };

    const handleDeleteAll = async () => {
        if (!confirm('Are you sure you want to DELETE ALL custom commands? This cannot be undone.')) return;
        try {
            const res = await fetch(`${API_BASE}/bulk`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (res.ok) {
                const result = await res.json();
                toast.success(`Deleted ${result.count} commands.`);
                fetchCommands();
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
            await fetch(`${API_BASE}/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            fetchCommands();
        } catch (err) {
            console.error('Failed to delete command', err);
        }
    };

    const toggleCommand = async (id: string, enabled: boolean) => {
        try {
            await fetch(`${API_BASE}/${id}/toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled }),
                credentials: 'include',
            });
            setCommands(commands.map(c => c.id === id ? { ...c, enabled } : c));
        } catch (err) {
            console.error('Failed to toggle command', err);
        }
    };

    const handleImport = async (importCommands: any[]) => {
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
            if (results.errors > 0) {
                toast.warning(`${results.errors} errors occurred during import`);
            }

            // Refresh commands list
            fetchCommands();
        } catch (err) {
            console.error('Failed to import commands', err);
            toast.error('Import failed. Check console for details.');
        }
    };

    // Filter commands based on category
    const filteredCommands = commands.filter(c =>
        activeCategory === 'built-in' ? c.isBuiltIn : !c.isBuiltIn
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between border-l-4 border-brand-primary pl-6 py-2">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-black tracking-tight text-white uppercase">Command Registry</h1>
                    <p className="text-zinc-500 text-sm font-bold tracking-wide">Manage automated chat responses and system utility functions.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="bg-zinc-900 border border-white/[0.05] text-zinc-400 font-black text-[10px] px-6 py-3 rounded-lg hover:bg-zinc-800 hover:text-white transition-all uppercase tracking-widest"
                    >
                        Import Commands
                    </button>
                    {activeCategory === 'custom' && filteredCommands.length > 0 && (
                        <button
                            onClick={handleDeleteAll}
                            className="bg-rose-500/10 border border-rose-500/20 text-rose-500 font-black text-[10px] px-6 py-3 rounded-lg hover:bg-rose-500 hover:text-white transition-all uppercase tracking-widest"
                        >
                            Delete All
                        </button>
                    )}
                    {activeCategory === 'custom' && filteredCommands.length > 0 && (
                        <button
                            onClick={handleDeleteAll}
                            className="bg-rose-500/10 border border-rose-500/20 text-rose-500 font-black text-[10px] px-6 py-3 rounded-lg hover:bg-rose-500 hover:text-white transition-all uppercase tracking-widest"
                        >
                            Delete All
                        </button>
                    )}
                    {activeCategory === 'custom' && filteredCommands.length > 0 && (
                        <button
                            onClick={handleDeleteAll}
                            className="bg-rose-500/10 border border-rose-500/20 text-rose-500 font-black text-[10px] px-6 py-3 rounded-lg hover:bg-rose-500 hover:text-white transition-all uppercase tracking-widest"
                        >
                            Delete All
                        </button>
                    )}
                    <button
                        onClick={() => {
                            setEditingCommand(undefined);
                            setIsModalOpen(true);
                        }}
                        className="bg-brand-primary text-white font-black text-[10px] px-6 py-3 rounded-lg hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20 uppercase tracking-widest"
                    >
                        + Add New Sequence
                    </button>
                </div>
            </div>

            {/* Category Toggle */}
            <div className="flex border-b border-white/[0.05]">
                {(['custom', 'built-in'] as const).map((cat) => (
                    <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${activeCategory === cat ? 'text-brand-primary' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        {cat.replace('-', ' ')}
                        {activeCategory === cat && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary shadow-[0_0_10px_rgba(0,163,255,0.5)]" />}
                    </button>
                ))}
            </div>

            <div className="space-y-12">
                {Object.entries(
                    filteredCommands.reduce((acc, cmd) => {
                        const cat = cmd.category || 'General';
                        if (!acc[cat]) acc[cat] = [];
                        acc[cat].push(cmd);
                        return acc;
                    }, {} as Record<string, Command[]>)
                ).sort(([a], [b]) => a.localeCompare(b)).map(([category, cmds]) => (
                    <div key={category} className="space-y-4">
                        <div className="flex items-center gap-4 px-2">
                            <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-500 whitespace-nowrap">{category}</h2>
                            <div className="h-px bg-white/[0.05] w-full" />
                            <span className="text-[9px] font-bold text-zinc-700 uppercase whitespace-nowrap">{cmds.length} Protocols</span>
                        </div>

                        <div className="glass-card rounded-xl overflow-hidden border border-white/[0.05] bg-white/[0.01]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white/[0.02] border-b border-white/[0.05]">
                                        <th className="px-6 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] w-20">State</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] w-48">Trigger</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em]">Response / Utility</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em]">Access</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] text-center">Hits</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] text-right">Settings</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.05]">
                                    {cmds.map((command) => (
                                        <tr key={command.id} className="hover:bg-white/[0.01] transition-colors group">
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => toggleCommand(command.id, !command.enabled)}
                                                    className={`w-10 h-5 rounded-md relative transition-all border border-white/5 ${command.enabled ? 'bg-brand-primary shadow-[0_0_10px_rgba(0,163,255,0.3)]' : 'bg-surface-bright'}`}
                                                >
                                                    <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-sm transition-all shadow-md ${command.enabled ? 'left-6' : 'left-0.5'}`} />
                                                </button>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="font-black text-brand-primary text-sm tracking-tight">!{command.trigger}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <p className="text-zinc-400 text-xs font-bold truncate max-w-md">
                                                        {command.responses && command.responses.length > 0 ? command.responses[0] : (command as any).response}
                                                        {command.responses?.length > 1 && <span className="text-brand-primary ml-2">(+{command.responses.length - 1} more)</span>}
                                                    </p>
                                                    {command.description && <p className="text-[9px] text-zinc-600 font-bold uppercase mt-1 italic leading-tight">{command.description}</p>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-[9px] font-black text-zinc-400 bg-white/[0.04] px-2.5 py-1 rounded-md border border-white/[0.05] uppercase tracking-widest">{command.userLevel}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-[10px] font-black text-white tabular-nums">{(command.usages || 0).toLocaleString()}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => {
                                                            setEditingCommand(command);
                                                            setIsModalOpen(true);
                                                        }}
                                                        className="px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.05] text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-all"
                                                    >
                                                        Edit
                                                    </button>
                                                    {!command.isBuiltIn && (
                                                        <button
                                                            onClick={() => handleDelete(command.id)}
                                                            className="px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.05] text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                                                        >
                                                            Delete
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="px-6 py-20 text-center text-zinc-600 font-black uppercase tracking-[0.4em] text-[10px] animate-pulse">Syncing Command Database...</div>
                )}
                {!isLoading && filteredCommands.length === 0 && (
                    <div className="px-6 py-20 text-center text-zinc-600 font-black uppercase tracking-[0.4em] text-[10px]">
                        No {activeCategory} commands detected.
                    </div>
                )}
            </div>

            <CommandModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingCommand as any}
            />

            <ImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImport={handleImport}
            />
        </div>
    );
}

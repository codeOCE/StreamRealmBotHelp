"use client";

import React, { useState, useEffect, useRef } from 'react';
import { VoidNumberInput } from './VoidNumberInput';
import { VoidSelect } from './VoidSelect';
import { parseResponsesJson, splitResponseList } from '@/lib/split-responses';

interface Command {
    id: string;
    trigger: string;
    responses: string[];
    responseType: 'SAY' | 'MENTION' | 'REPLY' | 'WHISPER';
    responseMode?: 'ALL' | 'RANDOM';
    aliases?: string[];
    usages?: number;
    userLevel: string;
    cooldown: number;
    userCooldown?: number;
    enabled: boolean;
    isBuiltIn?: boolean;
    description?: string;
    category?: string;
    isRegex?: boolean;
}

const CATEGORIES = [
    { value: 'General',    label: 'General',    description: 'Basic commands and common interactions.' },
    { value: 'Moderation', label: 'Moderation', description: 'Tools for channel management and safety.' },
    { value: 'Streaming',  label: 'Streaming',  description: 'Live stream status and metadata.' },
    { value: 'Loyalty',    label: 'Loyalty',    description: 'Viewer engagement and progress systems.' },
    { value: 'Utility',    label: 'Utility',    description: 'Technical links and utilities.' },
];

const RESPONSE_TYPES = [
    { value: 'SAY',     label: 'Say',     description: 'Posts the message normally in chat.' },
    { value: 'MENTION', label: 'Mention', description: 'Mentions the user who triggered the command.' },
    { value: 'REPLY',   label: 'Reply',   description: 'Replies directly to the user in chat.' },
    { value: 'WHISPER', label: 'Whisper', description: 'Sends the user a private message.' },
] as const;

const RESPONSE_MODES = [
    { value: 'ALL', label: 'Say all', description: 'Posts every response in order (up to 3 chat lines).' },
    { value: 'RANDOM', label: 'Random', description: 'Picks one response at random each time.' },
] as const;

const USER_LEVELS = [
    { value: 'VIEWER',      label: 'Everyone' },
    { value: 'SUBSCRIBER',  label: 'Subscribers' },
    { value: 'MODERATOR',   label: 'Moderators' },
    { value: 'BROADCASTER', label: 'Broadcaster only' },
];

interface CommandModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Omit<Command, 'id'> & { id?: string }) => void;
    initialData?: Command | null;
}

export default function CommandModal({ isOpen, onClose, onSave, initialData }: CommandModalProps) {
    const [trigger, setTrigger] = useState('');
    const [responses, setResponses] = useState<string[]>(['']);
    const [aliases, setAliases] = useState<string[]>([]);
    const [userLevel, setUserLevel] = useState('VIEWER');
    const [cooldown, setCooldown] = useState(30);
    const [userCooldown, setUserCooldown] = useState(10);
    const [responseType, setResponseType] = useState<'SAY' | 'MENTION' | 'REPLY' | 'WHISPER'>('SAY');
    const [responseMode, setResponseMode] = useState<'ALL' | 'RANDOM'>('ALL');
    const [showBulkImport, setShowBulkImport] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('General');
    const [isRegex, setIsRegex] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (initialData) {
            setTrigger(initialData.trigger);
            setResponses(Array.isArray(initialData.responses) ? initialData.responses : [initialData.responses as any]);
            setAliases(Array.isArray(initialData.aliases) ? initialData.aliases : []);
            setUserLevel(initialData.userLevel);
            setCooldown(initialData.cooldown);
            setUserCooldown(initialData.userCooldown || 0);
            setResponseType((initialData as any).responseType || 'SAY');
            setResponseMode(initialData.responseMode === 'RANDOM' ? 'RANDOM' : 'ALL');
            setDescription(initialData.description || '');
            setCategory(initialData.category || 'General');
            setIsRegex(initialData.isRegex || false);
        } else {
            setTrigger('');
            setResponses(['']);
            setAliases([]);
            setUserLevel('VIEWER');
            setCooldown(30);
            setUserCooldown(10);
            setResponseType('SAY');
            setResponseMode('ALL');
            setShowBulkImport(false);
            setBulkText('');
            setDescription('');
            setCategory('General');
            setIsRegex(false);
        }
        setError('');
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const addResponseField = () => setResponses([...responses, '']);
    const removeResponseField = (index: number) => {
        if (responses.length > 1) setResponses(responses.filter((_, i) => i !== index));
    };
    const updateResponseField = (index: number, value: string) => {
        const next = [...responses];
        next[index] = value;
        setResponses(next);
    };
    const mergeResponses = (items: string[]) => {
        const merged = [...responses.filter((r) => r.trim()), ...items.map((r) => r.trim()).filter(Boolean)];
        setResponses(merged.length > 0 ? merged : ['']);
    };

    const handleResponsePaste = (index: number, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const parts = splitResponseList(e.clipboardData.getData('text/plain'));
        if (parts.length <= 1) return;
        e.preventDefault();
        const next = [...responses];
        next.splice(index, 1, ...parts);
        setResponses(next.filter((r) => r.trim()).length > 0 ? next : ['']);
    };

    const applyBulkText = () => {
        const parts = splitResponseList(bulkText);
        if (parts.length === 0) {
            setError('Paste at least one line to import.');
            return;
        }
        mergeResponses(parts);
        setBulkText('');
        setShowBulkImport(false);
        setError('');
    };

    const handleJsonUpload = async (file: File) => {
        try {
            const text = await file.text();
            mergeResponses(parseResponsesJson(text));
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not read JSON file.');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const nonEmptyResponseCount = responses.filter((r) => r.trim()).length;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const filteredResponses = responses.filter(r => r.trim());

        if (!trigger.trim()) { setError('Trigger is required.'); return; }
        if (filteredResponses.length === 0 && !initialData?.isBuiltIn) {
            setError('At least one response is required.'); return;
        }
        if (isRegex) {
            try { new RegExp(trigger); } catch { setError('Invalid regular expression.'); return; }
        } else {
            if (!/^[a-zA-Z0-9_-]+$/.test(trigger)) {
                setError('Trigger can only contain letters, numbers, underscores, and dashes.'); return;
            }
        }

        onSave({
            id: initialData?.id,
            trigger: isRegex ? trigger : trigger.toLowerCase().replace('!', ''),
            responses: filteredResponses,
            responseType,
            responseMode: filteredResponses.length > 1 ? responseMode : 'ALL',
            aliases: isRegex ? [] : aliases.map(a => a.toLowerCase().replace('!', '').trim()).filter(Boolean),
            userLevel,
            cooldown,
            userCooldown,
            description,
            category,
            enabled: initialData ? initialData.enabled : true,
            isBuiltIn: initialData?.isBuiltIn || false,
            isRegex,
        });
        onClose();
    };

    const inputClass = "w-full bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:border-brand-primary/50 focus:bg-white/[0.05] transition-[border-color,background-color] duration-150";

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-[#050508]/85 backdrop-blur-xl animate-in fade-in duration-200"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-2xl bg-surface-base border border-white/8 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] overflow-hidden">

                {/* Header */}
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-base font-bold text-white tracking-tight">
                            {initialData?.isBuiltIn ? 'View Command' : initialData ? 'Edit Command' : 'New Command'}
                        </h2>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            {initialData?.isBuiltIn ? 'Built-in command' : 'Custom command'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-11 h-11 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white hover:bg-white/8 transition-colors duration-150 cursor-pointer"
                        aria-label="Close"
                    >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {error && (
                        <div className="mx-6 mt-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium flex items-center gap-3 animate-in slide-in-from-top-2 duration-150">
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="shrink-0">
                                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            {error}
                        </div>
                    )}

                    <form id="command-form" onSubmit={handleSubmit} className="p-6 space-y-6">

                        {/* ── Trigger & Aliases ── */}
                        <section className="space-y-4">
                            <h3 className="text-[10px] font-bold  text-zinc-600">Command</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-semibold text-zinc-400">Trigger</label>
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                id="isRegex"
                                                checked={isRegex}
                                                onChange={(e) => setIsRegex(e.target.checked)}
                                                className="w-3.5 h-3.5 rounded bg-white/5 border border-white/10 checked:bg-brand-primary appearance-none transition-colors cursor-pointer"
                                            />
                                            <span className="text-[10px] font-semibold text-zinc-500 ">Regex</span>
                                        </label>
                                    </div>
                                    <div className="relative">
                                        {!isRegex && (
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-primary font-bold text-lg leading-none pointer-events-none">!</span>
                                        )}
                                        <input
                                            autoFocus
                                            type="text"
                                            disabled={initialData?.isBuiltIn}
                                            value={trigger}
                                            onChange={(e) => setTrigger(e.target.value)}
                                            className={`${inputClass} ${!isRegex ? 'pl-8' : ''} font-bold text-base tracking-tight disabled:opacity-40 disabled:cursor-not-allowed`}
                                            placeholder={isRegex ? '^hello\\s+world$' : 'command'}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-zinc-400 block">Aliases</label>
                                    <input
                                        type="text"
                                        disabled={initialData?.isBuiltIn || isRegex}
                                        value={aliases.join(', ')}
                                        onChange={(e) => setAliases(e.target.value.split(',').map(s => s.trim()))}
                                        className={`${inputClass} disabled:opacity-40 disabled:cursor-not-allowed`}
                                        placeholder="alias1, alias2"
                                    />
                                    {!initialData?.isBuiltIn && (
                                        <p className="text-[10px] text-zinc-700 pl-1">Comma separated</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-zinc-400 block">Description</label>
                                    <input
                                        type="text"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className={inputClass}
                                        placeholder="Optional internal note..."
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-zinc-400 block">Category</label>
                                    <VoidSelect
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                    >
                                        {CATEGORIES.map((cat) => (
                                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                                        ))}
                                    </VoidSelect>
                                </div>
                            </div>
                        </section>

                        {/* ── Response Type ── */}
                        <section className="space-y-3">
                            <h3 className="text-[10px] font-bold  text-zinc-600">Response Type</h3>
                            <div className="space-y-1.5">
                                <VoidSelect
                                    value={responseType}
                                    onChange={(e) => setResponseType(e.target.value as typeof responseType)}
                                >
                                    {RESPONSE_TYPES.map((type) => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </VoidSelect>
                                <p className="text-[11px] text-zinc-500 pl-1">
                                    {RESPONSE_TYPES.find((r) => r.value === responseType)?.description}
                                </p>
                            </div>
                        </section>

                        {/* ── Responses ── */}
                        {!initialData?.isBuiltIn && (
                            <section className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h3 className="text-[10px] font-bold  text-zinc-600">Responses</h3>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowBulkImport((v) => !v)}
                                            className="text-[11px] font-semibold text-zinc-400 hover:text-white transition-colors duration-150 bg-white/[0.03] hover:bg-white/[0.06] px-3 py-1.5 rounded-lg border border-white/8 cursor-pointer"
                                        >
                                            {showBulkImport ? 'Hide import' : 'Paste list'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="text-[11px] font-semibold text-zinc-400 hover:text-white transition-colors duration-150 bg-white/[0.03] hover:bg-white/[0.06] px-3 py-1.5 rounded-lg border border-white/8 cursor-pointer"
                                        >
                                            Upload JSON
                                        </button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".json,application/json"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) void handleJsonUpload(file);
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={addResponseField}
                                            className="text-[11px] font-semibold text-brand-primary hover:text-white transition-colors duration-150 bg-brand-primary/10 hover:bg-brand-primary/20 px-3 py-1.5 rounded-lg border border-brand-primary/20 cursor-pointer"
                                        >
                                            + Add Response
                                        </button>
                                    </div>
                                </div>

                                {nonEmptyResponseCount > 1 && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-zinc-400 block">Multiple responses</label>
                                        <VoidSelect
                                            value={responseMode}
                                            onChange={(e) => setResponseMode(e.target.value as 'ALL' | 'RANDOM')}
                                        >
                                            {RESPONSE_MODES.map((mode) => (
                                                <option key={mode.value} value={mode.value}>{mode.label}</option>
                                            ))}
                                        </VoidSelect>
                                        <p className="text-[11px] text-zinc-500 pl-1">
                                            {RESPONSE_MODES.find((m) => m.value === responseMode)?.description}
                                        </p>
                                    </div>
                                )}

                                {showBulkImport && (
                                    <div className="space-y-2 rounded-xl border border-white/8 bg-white/[0.02] p-4">
                                        <p className="text-[11px] text-zinc-500">
                                            Paste one response per line. Bullets and numbered lists are stripped automatically.
                                        </p>
                                        <textarea
                                            value={bulkText}
                                            onChange={(e) => setBulkText(e.target.value)}
                                            className={`${inputClass} min-h-20 py-2 resize-y font-mono text-xs`}
                                            placeholder={'Line one\nLine two\n- bullet item\n3. numbered item'}
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button type="button" onClick={() => { setShowBulkImport(false); setBulkText(''); }} className="saas-button-secondary !py-2 !px-4 text-xs">
                                                Cancel
                                            </button>
                                            <button type="button" onClick={applyBulkText} className="saas-button !py-2 !px-4 text-xs">
                                                Add {splitResponseList(bulkText).length || ''} responses
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <p className="text-[10px] text-zinc-700 pl-1">
                                    Tip: paste a multi-line list into any response field to auto-split.
                                </p>

                                <div className="space-y-3">
                                    {responses.map((res, index) => (
                                        <div key={index} className="relative">
                                            <textarea
                                                value={res}
                                                onChange={(e) => updateResponseField(index, e.target.value)}
                                                onPaste={(e) => handleResponsePaste(index, e)}
                                                className={`${inputClass} min-h-10 py-2 resize-y ${responses.length > 1 ? 'pr-12' : ''}`}
                                                placeholder={`Response ${index + 1}...`}
                                            />
                                            {responses.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeResponseField(index)}
                                                    className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-rose-500/20 border border-white/8 hover:border-rose-500/30 rounded-lg text-zinc-600 hover:text-rose-400 transition-colors duration-150 cursor-pointer"
                                                    aria-label="Remove response"
                                                >
                                                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                                                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    ))}

                                    <p className="text-[11px] text-zinc-500">
                                        Need variables?{' '}
                                        <a
                                            href="/docs/variables"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-brand-primary hover:text-white font-semibold transition-colors"
                                        >
                                            Open variable reference
                                        </a>
                                    </p>
                                </div>
                            </section>
                        )}

                        {/* ── Permissions ── */}
                        <section className="space-y-3">
                            <h3 className="text-[10px] font-bold  text-zinc-600">Permissions &amp; Cooldowns</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-zinc-400 block">Who can use it</label>
                                    <VoidSelect
                                        value={userLevel}
                                        onChange={(e) => setUserLevel(e.target.value)}
                                    >
                                        {USER_LEVELS.map(l => (
                                            <option key={l.value} value={l.value}>{l.label}</option>
                                        ))}
                                    </VoidSelect>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-zinc-400 block">Global cooldown</label>
                                    <VoidNumberInput
                                        value={cooldown}
                                        onChange={setCooldown}
                                        min={0}
                                        suffix="sec"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-zinc-400 block">Per user cooldown</label>
                                    <VoidNumberInput
                                        value={userCooldown}
                                        onChange={setUserCooldown}
                                        min={0}
                                        suffix="sec"
                                    />
                                </div>
                            </div>
                        </section>

                    </form>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-3 shrink-0 bg-white/[0.01]">
                    <button
                        type="button"
                        onClick={onClose}
                        className="saas-button-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="command-form"
                        className="saas-button"
                    >
                        {initialData ? 'Save Changes' : 'Create Command'}
                    </button>
                </div>
            </div>
        </div>
    );
}

"use client";

import React, { useState, useEffect } from 'react';

interface Command {
    id: string;
    trigger: string;
    responses: string[];
    responseType: 'SAY' | 'MENTION' | 'REPLY' | 'WHISPER';
    aliases?: string[];
    usages?: number;
    userLevel: string;
    cooldown: number;
    enabled: boolean;
    isBuiltIn?: boolean;
    description?: string;
    category?: string;
}

const CATEGORIES = [
    { value: 'General', label: 'General', description: 'Basic commands and common interactions.' },
    { value: 'Moderation', label: 'Moderation', description: 'Tools for channel management and security.' },
    { value: 'Streaming', label: 'Streaming', description: 'Live stream status and metadata.' },
    { value: 'Loyalty', label: 'Loyalty', description: 'Viewer engagement and progress systems.' },
    { value: 'Utility', label: 'Utility', description: 'Technical links and list features.' },
];

const RESPONSE_TYPES = [
    { value: 'SAY', label: 'Say', description: 'Prints the message normally (no targeting of user).' },
    { value: 'MENTION', label: 'Mention', description: 'Mentions the user in message (ie @<user>).' },
    { value: 'REPLY', label: 'Reply', description: 'Replies to the user in chat.' },
    { value: 'WHISPER', label: 'Whisper', description: 'Send the user a direct message.' },
] as const;

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
    const [responseType, setResponseType] = useState<'SAY' | 'MENTION' | 'REPLY' | 'WHISPER'>('SAY');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('General');
    const [isResponseDropdownOpen, setIsResponseDropdownOpen] = useState(false);
    const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (initialData) {
            setTrigger(initialData.trigger);
            setResponses(Array.isArray(initialData.responses) ? initialData.responses : [initialData.responses as any]);
            setAliases(Array.isArray(initialData.aliases) ? initialData.aliases : []);
            setUserLevel(initialData.userLevel);
            setCooldown(initialData.cooldown);
            setResponseType((initialData as any).responseType || 'SAY');
            setDescription(initialData.description || '');
            setCategory(initialData.category || 'General');
        } else {
            setTrigger('');
            setResponses(['']);
            setAliases([]);
            setUserLevel('VIEWER');
            setCooldown(30);
            setResponseType('SAY');
            setDescription('');
            setCategory('General');
        }
        setError('');
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const addResponseField = () => {
        setResponses([...responses, '']);
    };

    const removeResponseField = (index: number) => {
        if (responses.length > 1) {
            setResponses(responses.filter((_, i) => i !== index));
        }
    };

    const updateResponseField = (index: number, value: string) => {
        const newResponses = [...responses];
        newResponses[index] = value;
        setResponses(newResponses);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const filteredResponses = responses.filter(r => r.trim());

        if (!trigger.trim()) {
            setError('Trigger is required.');
            return;
        }

        if (filteredResponses.length === 0 && !initialData?.isBuiltIn) {
            setError('At least one response is required for custom commands.');
            return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(trigger)) {
            setError('Trigger can only contain letters, numbers, underscores, and dashes.');
            return;
        }

        onSave({
            id: initialData?.id,
            trigger: trigger.toLowerCase().replace('!', ''),
            responses: filteredResponses,
            responseType,
            aliases: aliases.map(a => a.toLowerCase().replace('!', '').trim()).filter(a => a),
            userLevel,
            cooldown,
            description,
            category,
            enabled: initialData ? initialData.enabled : true,
            isBuiltIn: initialData?.isBuiltIn || false,
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="glass-card w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border-white/[0.05] flex flex-col max-h-[90vh] bg-[#020617]">
                {/* Header */}
                <div className="px-8 py-6 border-b border-white/[0.05] flex justify-between items-center bg-white/[0.01]">
                    <div>
                        <h2 className="text-xl font-black tracking-tight text-white uppercase">{initialData?.isBuiltIn ? 'Configure' : (initialData ? 'Edit' : 'New')} Command</h2>
                        <p className="text-[10px] text-zinc-500 mt-1 font-bold uppercase tracking-widest">
                            {initialData?.isBuiltIn ? 'System Managed Logic' : 'Custom Automated Sequence'}
                        </p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.03] text-zinc-500 hover:text-white transition-all hover:bg-white/[0.08] border border-white/[0.05]">✕</button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-12">
                    {error && (
                        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-3">
                            ⚠️ {error}
                        </div>
                    )}

                    <form id="command-form" onSubmit={handleSubmit} className="space-y-12">
                        {/* Section 1: Identity */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="w-1 h-3 bg-brand-primary rounded-full" />
                                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Identity</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Trigger</label>
                                    <div className="relative group">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-primary font-black text-lg">!</span>
                                        <input
                                            autoFocus
                                            type="text"
                                            disabled={initialData?.isBuiltIn}
                                            value={trigger}
                                            onChange={(e) => setTrigger(e.target.value)}
                                            className={`w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-9 py-4 focus:outline-none focus:border-brand-primary/50 transition-all font-black text-white text-lg tracking-tight placeholder:text-zinc-800 ${initialData?.isBuiltIn ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                                            placeholder="hello"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Aliases</label>
                                    <input
                                        type="text"
                                        disabled={initialData?.isBuiltIn}
                                        value={aliases.join(', ')}
                                        onChange={(e) => setAliases(e.target.value.split(',').map(s => s.trim()))}
                                        className={`w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-5 py-4 focus:outline-none focus:border-brand-primary/30 transition-all text-sm font-bold text-white placeholder:text-zinc-800 ${initialData?.isBuiltIn ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                                        placeholder="hi, hey"
                                    />
                                    {!initialData?.isBuiltIn && <p className="text-[8px] text-zinc-600 font-bold uppercase">Comma separated</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Internal Description</label>
                                    <input
                                        type="text"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-5 py-3 focus:outline-none focus:border-brand-primary/30 transition-all text-xs font-bold text-white placeholder:text-zinc-800"
                                        placeholder="What does this command do?"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Category Section</label>
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                                            className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-5 py-3 focus:outline-none focus:border-brand-primary/30 transition-all text-left flex justify-between items-center group"
                                        >
                                            <span className="text-xs font-bold text-white">
                                                {CATEGORIES.find(c => c.value === category)?.label || category}
                                            </span>
                                            <div className={`transition-transform duration-200 text-zinc-600 ${isCategoryDropdownOpen ? 'rotate-180' : ''}`}>
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </button>

                                        {isCategoryDropdownOpen && (
                                            <div className="absolute z-20 w-full mt-1 bg-[#0f172a] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden py-1">
                                                {CATEGORIES.map((cat) => (
                                                    <button
                                                        key={cat.value}
                                                        type="button"
                                                        onClick={() => {
                                                            setCategory(cat.value);
                                                            setIsCategoryDropdownOpen(false);
                                                        }}
                                                        className={`w-full px-4 py-2 text-left hover:bg-white/[0.05] transition-all flex flex-col ${category === cat.value ? 'bg-white/[0.03]' : ''}`}
                                                    >
                                                        <span className={`text-[10px] font-black ${category === cat.value ? 'text-brand-primary' : 'text-white'}`}>{cat.label}</span>
                                                        <span className="text-[8px] text-zinc-500 font-bold">{cat.description}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Response Logic */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="w-1 h-3 bg-brand-primary rounded-full" />
                                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Response Type</h3>
                            </div>

                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsResponseDropdownOpen(!isResponseDropdownOpen)}
                                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-5 py-4 focus:outline-none focus:border-brand-primary/50 transition-all text-left group"
                                >
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <div className="text-sm font-black text-white">{RESPONSE_TYPES.find(r => r.value === responseType)?.label}</div>
                                            <div className="text-[10px] text-zinc-500 font-bold mt-0.5">{RESPONSE_TYPES.find(r => r.value === responseType)?.description}</div>
                                        </div>
                                        <div className={`transition-transform duration-200 text-zinc-600 ${isResponseDropdownOpen ? 'rotate-180' : ''}`}>
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>
                                </button>

                                {isResponseDropdownOpen && (
                                    <div className="absolute z-10 w-full mt-2 bg-[#0a0f1d] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                        {RESPONSE_TYPES.map((type) => (
                                            <button
                                                key={type.value}
                                                type="button"
                                                onClick={() => {
                                                    setResponseType(type.value as any);
                                                    setIsResponseDropdownOpen(false);
                                                }}
                                                className={`w-full px-5 py-4 text-left hover:bg-white/[0.05] transition-all flex flex-col gap-0.5 ${responseType === type.value ? 'bg-white/[0.03]' : ''}`}
                                            >
                                                <div className={`text-sm font-black ${responseType === type.value ? 'text-brand-primary' : 'text-white'}`}>{type.label}</div>
                                                <div className="text-[10px] text-zinc-500 font-bold">{type.description}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Section 3: Messages */}
                        {!initialData?.isBuiltIn && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1 h-3 bg-brand-primary rounded-full" />
                                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Responses</h3>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={addResponseField}
                                        className="text-[9px] font-black uppercase tracking-widest text-brand-primary hover:text-brand-primary/80 transition-all"
                                    >
                                        + Multi-Message
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {responses.map((res, index) => (
                                        <div key={index} className="relative group/field">
                                            <textarea
                                                value={res}
                                                onChange={(e) => updateResponseField(index, e.target.value)}
                                                className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-5 py-4 focus:outline-none focus:border-brand-primary/30 transition-all text-sm min-h-[80px] resize-none font-bold text-white placeholder:text-zinc-800"
                                                placeholder={`Message ${index + 1}...`}
                                            />
                                            {responses.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeResponseField(index)}
                                                    className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-500 hover:bg-rose-500/20 transition-all"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <div className="p-4 rounded-xl border border-white/[0.02] bg-white/[0.01] flex flex-wrap gap-2 items-center">
                                        <span className="text-[8px] font-black uppercase text-zinc-600 tracking-widest">Variables:</span>
                                        {['{user}', '{touser}', '{count}'].map(v => (
                                            <code key={v} className="text-[9px] text-brand-primary font-black bg-brand-primary/5 px-1.5 py-0.5 rounded">{v}</code>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Section 3: Permissions & Limits */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="w-1 h-3 bg-brand-primary rounded-full" />
                                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Gatekeeping</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Access Level</label>
                                    <select
                                        value={userLevel}
                                        onChange={(e) => setUserLevel(e.target.value)}
                                        className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-5 py-4 focus:outline-none focus:border-brand-primary/50 transition-all text-[10px] font-black text-white uppercase tracking-widest appearance-none cursor-pointer"
                                    >
                                        <option value="VIEWER">Everyone</option>
                                        <option value="SUBSCRIBER">Subscribers</option>
                                        <option value="MODERATOR">Moderators</option>
                                        <option value="BROADCASTER">Broadcaster</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Global Cooldown</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={cooldown}
                                            onChange={(e) => setCooldown(parseInt(e.target.value) || 0)}
                                            className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-5 py-4 focus:outline-none focus:border-brand-primary/50 transition-all text-sm font-black text-white"
                                            min="0"
                                        />
                                        <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[9px] font-black text-zinc-600 uppercase tracking-widest">Sec</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-white/[0.05] flex justify-end gap-3 bg-white/[0.01]">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-zinc-500 font-black text-[10px] uppercase tracking-widest hover:bg-white/[0.08] hover:text-white transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="command-form"
                        className="px-8 py-3 bg-brand-primary text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20 active:scale-[0.98]"
                    >
                        {initialData ? 'Apply Changes' : 'Initialize Command'}
                    </button>
                </div>
            </div>
        </div>
    );
}

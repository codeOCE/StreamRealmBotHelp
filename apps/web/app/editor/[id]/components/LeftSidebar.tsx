'use client';

import React, { useState, useEffect } from 'react';
import { useEditor } from '../store';
import { Layers, Type, MessageSquare, Bell, Image as ImageIcon, Video, Eye, Lock, Folder, Trash2, Settings, Edit2, Zap, Monitor, Sparkles } from 'lucide-react';

export function LeftSidebar() {
    const { state, dispatch } = useEditor();
    const selectedWidget = state.widgets.find(w => state.selectedWidgetIds.includes(w.id));

    // Tabs: 'layers', 'properties', 'animation'
    // If no widget selected, 'properties' shows canvas settings
    const [activeTab, setActiveTab] = useState<'layers' | 'properties' | 'animation'>('layers');

    // Auto-switch to properties when a widget is selected (optional, can be annoying if over-aggressive)
    // For now, let's just make sure if we are on animation but deselect, we go back to layers or properties
    useEffect(() => {
        if (!selectedWidget && activeTab === 'animation') {
            setActiveTab('properties'); // or 'layers'
        }
    }, [selectedWidget, activeTab]);

    return (
        <div className="w-80 bg-[#09090b] border-r border-[#27272a] flex flex-col h-full z-20 shrink-0">
            {/* Main Tabs */}
            <div className="flex border-b border-[#27272a] bg-[#09090b]">
                <TabButton
                    active={activeTab === 'layers'}
                    onClick={() => setActiveTab('layers')}
                    icon={<Layers size={14} />}
                    label="Layers"
                />
                <TabButton
                    active={activeTab === 'properties'}
                    onClick={() => setActiveTab('properties')}
                    icon={<Settings size={14} />}
                    label="Settings"
                />
                {selectedWidget && (
                    <TabButton
                        active={activeTab === 'animation'}
                        onClick={() => setActiveTab('animation')}
                        icon={<Sparkles size={14} />}
                        label="Anim"
                    />
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#09090b]">

                {/* ---------------- LAYERS TAB ---------------- */}
                {activeTab === 'layers' && (
                    <div className="flex flex-col h-full">
                        {/* Layers Header Actions */}
                        <div className="h-10 border-b border-[#27272a]/50 flex items-center justify-between px-4 bg-[#18181b]/30">
                            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Layer List</span>
                            <div className="flex gap-2 text-neutral-500">
                                <button className="hover:text-white transition-colors" title="Delete Selected">
                                    <Trash2 size={12} onClick={() => selectedWidget && dispatch({ type: 'REMOVE_WIDGET', payload: selectedWidget.id })} />
                                </button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-1 py-2">
                            {state.widgets.length === 0 ? (
                                <div className="px-4 py-8 text-center text-xs text-neutral-600 italic">
                                    No layers active
                                </div>
                            ) : (
                                state.widgets
                                    .sort((a, b) => b.layer - a.layer)
                                    .map((widget) => {
                                        const isSelected = state.selectedWidgetIds.includes(widget.id);
                                        return (
                                            <div
                                                key={widget.id}
                                                onClick={() => {
                                                    dispatch({ type: 'SELECT_WIDGET', payload: { id: widget.id, multi: false } });
                                                    // Optionally auto-switch to properties? 
                                                    // setActiveTab('properties'); 
                                                }}
                                                className={`
                                                    group flex items-center justify-between px-4 py-2 cursor-pointer border-l-2 transition-all
                                                    ${isSelected
                                                        ? 'bg-[#27272a]/50 border-purple-500 shadow-sm'
                                                        : 'border-transparent hover:bg-[#27272a]/30'
                                                    }
                                                `}
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className={`transition-opacity ${isSelected ? 'opacity-100' : 'opacity-50 group-hover:opacity-100'}`}>
                                                        {getIconForType(widget.type)}
                                                    </div>
                                                    <span className={`text-xs font-medium truncate ${isSelected ? 'text-white' : 'text-neutral-400 group-hover:text-neutral-200'}`}>
                                                        {widget.type.charAt(0).toUpperCase() + widget.type.slice(1)} Widget
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button className="text-neutral-500 hover:text-white"><Eye size={12} /></button>
                                                    <button className="text-neutral-500 hover:text-white"><Lock size={12} /></button>
                                                </div>
                                            </div>
                                        );
                                    })
                            )}
                        </div>

                        {/* Quick Add at Bottom of Layers */}
                        <div className="border-t border-[#27272a] p-4 bg-[#09090b]">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Quick Add</span>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                <MiniShortcutButton icon={<Type size={14} />} onClick={() => dispatch({ type: 'ADD_WIDGET', payload: { type: 'text' } })} />
                                <MiniShortcutButton icon={<ImageIcon size={14} />} onClick={() => dispatch({ type: 'ADD_WIDGET', payload: { type: 'image' } })} />
                                <MiniShortcutButton icon={<MessageSquare size={14} />} onClick={() => dispatch({ type: 'ADD_WIDGET', payload: { type: 'chat' } })} />
                                <MiniShortcutButton icon={<Bell size={14} />} onClick={() => dispatch({ type: 'ADD_WIDGET', payload: { type: 'alert' } })} />
                            </div>
                        </div>
                    </div>
                )}

                {/* ---------------- PROPERTIES TAB (Settings) ---------------- */}
                {activeTab === 'properties' && (
                    <div className="p-5 space-y-8 animate-in slide-in-from-left-2 duration-200">
                        {selectedWidget ? (
                            <>
                                {/* WIDGET PROPERTIES */}
                                <section>
                                    <SectionHeader icon={<Settings size={14} />} title="Element Settings" />
                                    <div className="space-y-3">
                                        <Label>Layer Name</Label>
                                        <div className="bg-[#0f0f13] border border-[#27272a] rounded p-2 text-sm text-white focus-within:border-purple-500 transition-colors">
                                            {selectedWidget.type.charAt(0).toUpperCase() + selectedWidget.type.slice(1)} Box
                                        </div>
                                    </div>
                                </section>

                                <section>
                                    <Label className="mb-3 block">Transform</Label>
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <InputGroup label="X Position" prefix="PX" value={selectedWidget.x} onChange={(val) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { x: val } } })} />
                                        <InputGroup label="Y Position" prefix="PX" value={selectedWidget.y} onChange={(val) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { y: val } } })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <InputGroup label="Width" prefix="W" value={selectedWidget.width} onChange={(val) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { width: val } } })} />
                                        <InputGroup label="Height" prefix="H" value={selectedWidget.height} onChange={(val) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { height: val } } })} />
                                    </div>
                                </section>

                                <section>
                                    <Label className="mb-3 block">Visual Styles</Label>
                                    <div className="space-y-4">
                                        <div>
                                            <Label className="mb-2 block text-[10px]">Background Color</Label>
                                            <div className="flex gap-2">
                                                <div className="w-10 h-10 rounded bg-[#4b2bee] border border-white/10 shrink-0"></div>
                                                <div className="flex-1 bg-[#0f0f13] border border-[#27272a] rounded flex items-center px-3 text-xs font-mono text-neutral-300">#4b2bee</div>
                                                <button className="w-10 h-10 rounded bg-[#18181b] border border-[#27272a] flex items-center justify-center hover:bg-white/5"><Edit2 size={14} className="text-neutral-400" /></button>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <Label className="text-sm text-neutral-300">Drop Shadow</Label>
                                            <div className="w-10 h-5 bg-purple-600 rounded-full relative cursor-pointer">
                                                <div className="absolute right-1 top-1 bottom-1 w-3 bg-white rounded-full shadow-sm"></div>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </>
                        ) : (
                            <>
                                {/* CANVAS SETTINGS (No Selection) */}
                                <section>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Monitor size={16} className="text-purple-400" />
                                        <h2 className="text-sm font-bold text-white">Canvas Settings</h2>
                                    </div>

                                    <Label className="mb-3 block">Resolution Preset</Label>
                                    <div className="grid grid-cols-1 gap-2">
                                        <ResolutionBtn
                                            label="1080p (Full HD)" sub="1920 x 1080"
                                            active={state.overlay?.width === 1920 && state.overlay?.height === 1080}
                                            onClick={() => dispatch({ type: 'SET_OVERLAY', payload: { ...state.overlay!, width: 1920, height: 1080 } })}
                                        />
                                        <ResolutionBtn
                                            label="720p (HD)" sub="1280 x 720"
                                            active={state.overlay?.width === 1280 && state.overlay?.height === 720}
                                            onClick={() => dispatch({ type: 'SET_OVERLAY', payload: { ...state.overlay!, width: 1280, height: 720 } })}
                                        />
                                        <ResolutionBtn
                                            label="1440p (2K)" sub="2560 x 1440"
                                            active={state.overlay?.width === 2560 && state.overlay?.height === 1440}
                                            onClick={() => dispatch({ type: 'SET_OVERLAY', payload: { ...state.overlay!, width: 2560, height: 1440 } })}
                                        />
                                    </div>
                                </section>

                                <section>
                                    <Label className="mb-3 block">Custom Size</Label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <InputGroup label="Width" prefix="W" value={state.overlay?.width || 1920} onChange={(val) => dispatch({ type: 'SET_OVERLAY', payload: { ...state.overlay!, width: val } })} />
                                        <InputGroup label="Height" prefix="H" value={state.overlay?.height || 1080} onChange={(val) => dispatch({ type: 'SET_OVERLAY', payload: { ...state.overlay!, height: val } })} />
                                    </div>
                                </section>
                            </>
                        )}
                    </div>
                )}

                {/* ---------------- ANIMATION TAB ---------------- */}
                {activeTab === 'animation' && selectedWidget && (
                    <div className="p-5 space-y-6 animate-in slide-in-from-left-2 duration-200">
                        <SectionHeader icon={<Sparkles size={14} />} title="Animation Triggers" />

                        <div className="bg-[#0f0f13] border border-[#27272a] rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Zap size={12} className="text-yellow-400" />
                                <span className="text-xs font-bold text-white">On Subscription</span>
                            </div>
                            <p className="text-[10px] text-neutral-500 leading-relaxed mb-3">
                                Plays "Victory_Sound.mp3" and triggers pulse animation for 5 seconds.
                            </p>
                            <button className="w-full py-1.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] rounded text-[10px] font-bold text-purple-400 transition-colors">
                                Edit Sequence
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}


// --- Components ---

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
    return (
        <button
            onClick={onClick}
            className={`flex-1 py-3 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 
                ${active ? 'border-purple-500 text-white bg-[#0f0f13]' : 'border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-white/5'}`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

function MiniShortcutButton({ icon, onClick }: { icon: React.ReactNode; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center justify-center h-10 bg-[#18181b] hover:bg-[#27272a] rounded border border-[#27272a] hover:border-[#3f3f46] transition-all text-neutral-400 hover:text-white"
        >
            {icon}
        </button>
    );
}

function ResolutionBtn({ label, sub, active, onClick }: { label: string, sub: string, active: boolean, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-2 rounded text-xs font-medium border transition-colors flex justify-between items-center ${active ? 'bg-purple-600/10 border-purple-500 text-white' : 'bg-[#18181b] border-[#27272a] text-neutral-400 hover:border-neutral-600'}`}
        >
            <span>{label}</span>
            <span className="opacity-50 text-[10px]">{sub}</span>
        </button>
    );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode, title: string }) {
    return (
        <div className="flex items-center gap-2 mb-3 text-purple-400">
            {icon}
            <span className="text-xs font-bold text-white">{title}</span>
        </div>
    );
}

function Label({ children, className = '' }: { children: React.ReactNode, className?: string }) {
    return <span className={`text-[10px] font-bold uppercase text-neutral-500 ${className}`}>{children}</span>;
}

function InputGroup({ label, prefix, value, onChange }: { label: string; prefix: string; value: number; onChange: (val: number) => void }) {
    return (
        <div>
            <Label className="mb-1.5 block text-[9px]">{label}</Label>
            <div className="flex bg-[#0f0f13] border border-[#27272a] rounded overflow-hidden focus-within:border-purple-500/50 transition-colors">
                <div className="px-2 py-1.5 text-[9px] font-bold text-neutral-600 border-r border-[#27272a] flex items-center justify-center min-w-[24px]">
                    {prefix}
                </div>
                <input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="w-full bg-transparent text-xs text-white px-2 focus:outline-none"
                />
            </div>
        </div>
    );
}

function getIconForType(type: string) {
    switch (type) {
        case 'chat': return <MessageSquare size={14} className="text-purple-400" />;
        case 'alert': return <Bell size={14} className="text-amber-400" />;
        case 'text': return <Type size={14} className="text-blue-400" />;
        case 'image': return <ImageIcon size={14} className="text-pink-400" />;
        default: return <Layers size={14} className="text-neutral-400" />;
    }
}

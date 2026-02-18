'use client';

import React, { useState } from 'react';
import { useEditor } from '../store';
import { Settings, Trash2, Edit2, Zap, Monitor } from 'lucide-react';

export function RightSidebar() {
    const { state, dispatch } = useEditor();
    const selectedWidget = state.widgets.find(w => state.selectedWidgetIds.includes(w.id));
    const [activeTab, setActiveTab] = useState<'properties' | 'animation'>('properties');

    // If no widget selected, show Canvas/Overlay Settings
    if (!selectedWidget) {
        return (
            <div className="w-80 bg-[#09090b] border-l border-[#27272a] flex flex-col h-full z-20 shrink-0">
                <div className="p-4 border-b border-[#27272a]">
                    <div className="flex items-center gap-2 mb-1">
                        <Monitor size={16} className="text-purple-400" />
                        <h2 className="text-sm font-bold text-white">Canvas Settings</h2>
                    </div>
                    <p className="text-[10px] text-neutral-500">Configure your overlay resolution.</p>
                </div>

                <div className="p-5 space-y-6">
                    <section>
                        <Label classNam="mb-3 block">Resolution Preset</Label>
                        <div className="grid grid-cols-1 gap-2">
                            <button
                                onClick={() => dispatch({ type: 'SET_OVERLAY', payload: { ...state.overlay!, width: 1920, height: 1080 } })}
                                className={`px-3 py-2 rounded text-xs font-medium border transition-colors flex justify-between ${state.overlay?.width === 1920 && state.overlay?.height === 1080 ? 'bg-purple-600/10 border-purple-500 text-white' : 'bg-[#18181b] border-[#27272a] text-neutral-400 hover:border-neutral-600'}`}
                            >
                                <span>1080p (Full HD)</span>
                                <span className="opacity-50">1920 x 1080</span>
                            </button>
                            <button
                                onClick={() => dispatch({ type: 'SET_OVERLAY', payload: { ...state.overlay!, width: 1280, height: 720 } })}
                                className={`px-3 py-2 rounded text-xs font-medium border transition-colors flex justify-between ${state.overlay?.width === 1280 && state.overlay?.height === 720 ? 'bg-purple-600/10 border-purple-500 text-white' : 'bg-[#18181b] border-[#27272a] text-neutral-400 hover:border-neutral-600'}`}
                            >
                                <span>720p (HD)</span>
                                <span className="opacity-50">1280 x 720</span>
                            </button>
                            <button
                                onClick={() => dispatch({ type: 'SET_OVERLAY', payload: { ...state.overlay!, width: 2560, height: 1440 } })}
                                className={`px-3 py-2 rounded text-xs font-medium border transition-colors flex justify-between ${state.overlay?.width === 2560 && state.overlay?.height === 1440 ? 'bg-purple-600/10 border-purple-500 text-white' : 'bg-[#18181b] border-[#27272a] text-neutral-400 hover:border-neutral-600'}`}
                            >
                                <span>1440p (2K)</span>
                                <span className="opacity-50">2560 x 1440</span>
                            </button>
                            <button
                                onClick={() => dispatch({ type: 'SET_OVERLAY', payload: { ...state.overlay!, width: 3840, height: 2160 } })}
                                className={`px-3 py-2 rounded text-xs font-medium border transition-colors flex justify-between ${state.overlay?.width === 3840 && state.overlay?.height === 2160 ? 'bg-purple-600/10 border-purple-500 text-white' : 'bg-[#18181b] border-[#27272a] text-neutral-400 hover:border-neutral-600'}`}
                            >
                                <span>2160p (4K)</span>
                                <span className="opacity-50">3840 x 2160</span>
                            </button>
                        </div>
                    </section>

                    <section>
                        <Label className="mb-3 block">Custom Size</Label>
                        <div className="grid grid-cols-2 gap-4">
                            <InputGroup
                                label="Width"
                                prefix="W"
                                value={state.overlay?.width || 1920}
                                onChange={(val) => dispatch({ type: 'SET_OVERLAY', payload: { ...state.overlay!, width: val } })}
                            />
                            <InputGroup
                                label="Height"
                                prefix="H"
                                value={state.overlay?.height || 1080}
                                onChange={(val) => dispatch({ type: 'SET_OVERLAY', payload: { ...state.overlay!, height: val } })}
                            />
                        </div>
                    </section>
                </div>
            </div>
        );
    }

    return (
        <div className="w-80 bg-[#09090b] border-l border-[#27272a] flex flex-col h-full z-20 shrink-0">
            {/* Tabs */}
            <div className="flex border-b border-[#27272a]">
                <button
                    onClick={() => setActiveTab('properties')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'properties' ? 'border-purple-500 text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
                >
                    Properties
                </button>
                <button
                    onClick={() => setActiveTab('animation')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'animation' ? 'border-purple-500 text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
                >
                    Animation
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-8">
                {/* Element Settings */}
                <section>
                    <SectionHeader icon={<Settings size={14} />} title="Element Settings" />
                    <div className="space-y-3">
                        <Label>Layer Name</Label>
                        <div className="bg-[#0f0f13] border border-[#27272a] rounded p-2 text-sm text-white focus-within:border-purple-500 transition-colors">
                            {selectedWidget.type.charAt(0).toUpperCase() + selectedWidget.type.slice(1)} Box
                        </div>
                    </div>
                </section>

                {/* Transform */}
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

                {/* Visual Styles */}
                <section>
                    <Label className="mb-3 block">Visual Styles</Label>
                    <div className="space-y-4">
                        <div>
                            <Label className="mb-2 block text-[10px]">Background Color</Label>
                            <div className="flex gap-2">
                                <div className="w-10 h-10 rounded bg-[#4b2bee] border border-white/10 shrink-0"></div>
                                <div className="flex-1 bg-[#0f0f13] border border-[#27272a] rounded flex items-center px-3 text-xs font-mono text-neutral-300">
                                    #4b2bee
                                </div>
                                <button className="w-10 h-10 rounded bg-[#18181b] border border-[#27272a] flex items-center justify-center hover:bg-white/5">
                                    <Edit2 size={14} className="text-neutral-400" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between mb-2">
                                <Label className="text-[10px]">Opacity</Label>
                                <span className="text-[10px] text-neutral-500">100%</span>
                            </div>
                            <div className="h-1.5 bg-[#27272a] rounded-full overflow-hidden">
                                <div className="h-full w-full bg-purple-500"></div>
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

                {/* Triggers (Mock) */}
                <section>
                    <Label className="mb-3 block">Triggers</Label>
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
                </section>

                <div className="pt-4 border-t border-[#27272a]">
                    <button
                        onClick={() => dispatch({ type: 'REMOVE_WIDGET', payload: selectedWidget.id })}
                        className="w-full flex items-center justify-center gap-2 py-2 text-red-500/80 hover:text-red-500 text-xs font-bold transition-colors"
                    >
                        <Trash2 size={12} />
                        Delete Element
                    </button>
                </div>
            </div>
        </div>
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

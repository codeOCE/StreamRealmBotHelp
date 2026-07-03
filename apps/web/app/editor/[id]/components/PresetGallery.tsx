'use client';

import React from 'react';
import { X, Check } from 'lucide-react';
import { ALERT_PRESETS, AlertPreset } from '@/lib/alert-presets';
import { buildAlertSrcDoc, AlertData } from '@/lib/alert-renderer';

// A subscribe sample shows off label + message adaptation in one shot.
const SAMPLE: AlertData = { type: 'subscribe', username: 'StreamFan', message: 'Love the stream!', amount: 100, tier: '1000' };

interface Props {
    activeId?: string;
    onApply: (preset: AlertPreset) => void;
    onClose: () => void;
}

export function PresetGallery({ activeId, onApply, onClose }: Props) {
    return (
        <div
            className="absolute inset-0 z-[10] bg-[#070910]/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-150"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
                <div>
                    <h3 className="text-[13px] font-black text-white tracking-tight">Alert Presets</h3>
                    <p className="text-[10px] text-zinc-600 mt-0.5">Pick a design — every preset adapts its label, icon &amp; colour to each event. You can tweak the code after.</p>
                </div>
                <button onClick={onClose} aria-label="Close presets" className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white hover:bg-white/8 transition-colors duration-150 cursor-pointer">
                    <X size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {ALERT_PRESETS.map((p) => {
                        const active = activeId === p.id;
                        return (
                            <button
                                key={p.id}
                                onClick={() => { onApply(p); onClose(); }}
                                className={`group text-left rounded-2xl border overflow-hidden transition-[border-color,transform] duration-150 cursor-pointer hover:-translate-y-0.5 ${
                                    active ? 'border-brand-primary' : 'border-white/8 hover:border-white/20'
                                }`}
                            >
                                {/* Live preview on a stream-ish backdrop */}
                                <div
                                    className="relative h-[150px] overflow-hidden flex items-center justify-center"
                                    style={{ background: 'repeating-conic-gradient(#15171e 0% 25%, #0e1015 0% 50%) 50% / 22px 22px' }}
                                >
                                    <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 45%, ${p.accent}22, transparent 70%)` }} />
                                    <iframe
                                        srcDoc={buildAlertSrcDoc({ htmlTemplate: p.html, customCss: p.css, customJs: p.js }, SAMPLE)}
                                        sandbox="allow-scripts"
                                        className="w-[200%] h-[200%] border-0 origin-center pointer-events-none"
                                        style={{ transform: 'scale(0.5)', background: 'transparent' }}
                                        title={`${p.name} preview`}
                                    />
                                    {active && (
                                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-brand-primary flex items-center justify-center shadow-lg">
                                            <Check size={13} className="text-[#05070a]" />
                                        </div>
                                    )}
                                </div>
                                <div className="px-3.5 py-3 bg-[#0a0c10]">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.accent, boxShadow: `0 0 8px ${p.accent}` }} />
                                        <span className="text-[12px] font-black text-white tracking-tight">{p.name}</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-600 mt-1 leading-relaxed">{p.description}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

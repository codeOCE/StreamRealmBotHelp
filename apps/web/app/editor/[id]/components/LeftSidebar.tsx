'use client';

import React, { useState } from 'react';
import { useEditor, Widget } from '../store';
import { apiUrl } from '@/lib/api';
import { DEFAULT_ALERT_HTML, DEFAULT_ALERT_CSS, DEFAULT_ALERT_JS, getAlertEventConfig } from '@/lib/alert-renderer';
import { ENTRANCE_PRESETS, LOOP_PRESETS, AnimationConfig } from '@/lib/widget-animations';
import { AlertEditorModal } from './AlertEditorModal';
import { paletteWidgets, isBundleWidget, getWidgetDefinition } from '@/lib/widgets/registry';
import { defaultFieldData } from '@/lib/widgets/runtime';
import type { Field } from '@/lib/widgets/types';
import { PLATFORMS, getChatConfig, ChatConfig, ChatPlatform } from '@/lib/chat-config';
import {
    Plus, Layers, Type, MessageSquare, Bell, Image as ImageIcon,
    Eye, EyeOff, Lock, Unlock, GripVertical,
    Zap, MousePointer2, MonitorPlay, Square, ChevronRight, Code2, ScrollText,
    BringToFront, SendToBack, ChevronsUp, ChevronsDown,
    AlignStartVertical, AlignCenterVertical, AlignEndVertical,
    AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
    AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from 'lucide-react';

const inputCls = "w-full bg-white/[0.03] border border-white/8 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:border-brand-primary/50 focus:bg-white/[0.04] transition-[border-color,background-color] duration-150";
const selectCls = "void-select void-select-compact";
const sectionHeading = "text-[9px] font-black uppercase tracking-[0.25em] text-zinc-600";

const QUICK_EVENTS = [
    { key: 'follow',    label: 'Follow',   preview: { type: 'follow', username: 'TestViewer', message: '' } },
    { key: 'subscribe', label: 'Sub',      preview: { type: 'subscribe', username: 'TestSub', message: 'Thanks!', tier: '1000' } },
    { key: 'cheer',     label: 'Cheer',    preview: { type: 'cheer', username: 'BitsDonor', message: 'GG', amount: 100 } },
    { key: 'raid',      label: 'Raid',     preview: { type: 'raid', username: 'RaidLeader', message: '', amount: 25 } },
    { key: 'donation',  label: 'Tip',      preview: { type: 'donation', username: 'Supporter', message: '', amount: 5 } },
    { key: 'gift',      label: 'Gift',     preview: { type: 'gift', username: 'GiftGiver', message: '', amount: 1 } },
];

export function LeftSidebar() {
    const { state, dispatch } = useEditor();
    const { widgets, selectedWidgetIds } = state;
    const selectedWidget = widgets.find(w => selectedWidgetIds.includes(w.id));
    const [showAlertModal, setShowAlertModal] = useState(false);
    const [propTab, setPropTab] = useState<'properties' | 'animation'>('properties');
    const [dragId, setDragId] = useState<string | null>(null);

    // Move a layer to where the dropped-on row sits, then renumber from the
    // displayed (front → back) order.
    const reorderLayers = (draggedId: string, targetId: string) => {
        if (draggedId === targetId) return;
        const ids = [...widgets].sort((a, b) => b.layer - a.layer).map(w => w.id);
        const from = ids.indexOf(draggedId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(from, 1);
        ids.splice(to, 0, draggedId);
        dispatch({ type: 'REORDER_LAYERS', payload: ids });
    };

    return (
        <div className="w-72 bg-surface-base flex flex-col border-r border-white/5 z-20 overflow-hidden shrink-0">

            {/* ── Layers ── */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Layers size={12} className="text-brand-primary" />
                        <span className={sectionHeading}>Layers</span>
                    </div>
                    <span className="text-[9px] font-black text-zinc-700">{widgets.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
                    {widgets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                            <div className="w-10 h-10 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-zinc-700 mb-3">
                                <Plus size={18} />
                            </div>
                            <p className="text-[10px] text-zinc-700 font-medium leading-relaxed">No layers yet.<br />Use Quick Add below.</p>
                        </div>
                    ) : (
                        [...widgets].sort((a, b) => b.layer - a.layer).map(widget => (
                            <LayerRow
                                key={widget.id}
                                widget={widget}
                                isSelected={selectedWidgetIds.includes(widget.id)}
                                isDragging={dragId === widget.id}
                                onDragStartRow={() => setDragId(widget.id)}
                                onDragEndRow={() => setDragId(null)}
                                onDropRow={() => { if (dragId) reorderLayers(dragId, widget.id); setDragId(null); }}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* ── Properties ── */}
            <div className="h-[56%] border-t border-white/5 flex flex-col">
                <div className="px-4 py-2.5 border-b border-white/5 bg-white/[0.01] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setPropTab('properties')}
                            className={`${sectionHeading} pb-1.5 -mb-2.5 cursor-pointer transition-colors ${propTab === 'properties' ? 'text-brand-primary border-b border-brand-primary' : 'hover:text-zinc-400'}`}
                        >Properties</button>
                        <button
                            onClick={() => setPropTab('animation')}
                            className={`${sectionHeading} pb-1.5 -mb-2.5 cursor-pointer transition-colors ${propTab === 'animation' ? 'text-brand-primary border-b border-brand-primary' : 'hover:text-zinc-400'}`}
                        >Animation</button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
                    {selectedWidget && propTab === 'properties' ? (
                        <>
                            {/* Position & size */}
                            <section className="space-y-3">
                                <p className={sectionHeading}>Transform</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <InputBox label="X" value={Math.round(selectedWidget.x)} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { x: Number(v) } } })} />
                                    <InputBox label="Y" value={Math.round(selectedWidget.y)} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { y: Number(v) } } })} />
                                    <InputBox label="W" value={Math.round(selectedWidget.width)} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { width: Number(v) } } })} />
                                    <InputBox label="H" value={Math.round(selectedWidget.height)} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { height: Number(v) } } })} />
                                    <InputBox label="Rotation" value={Math.round(selectedWidget.rotation || 0)} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { rotation: Number(v) } } })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block">Layer name</label>
                                    <input
                                        className={inputCls}
                                        value={selectedWidget.config.name || selectedWidget.type}
                                        onChange={(e) => dispatch({ type: 'UPDATE_WIDGET_CONFIG', payload: { id: selectedWidget.id, config: { name: e.target.value } } })}
                                    />
                                </div>

                                {/* Arrange — align + z-order (also on right-click & ⌘[ / ⌘]) */}
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block">Arrange</label>
                                    <div className="flex items-center gap-1 bg-white/[0.02] border border-white/8 rounded-lg p-1">
                                        {([
                                            ['left', AlignStartVertical], ['hcenter', AlignCenterVertical], ['right', AlignEndVertical],
                                            ['top', AlignStartHorizontal], ['vcenter', AlignCenterHorizontal], ['bottom', AlignEndHorizontal],
                                        ] as const).map(([dir, Icon]) => (
                                            <button key={dir} title={`Align ${dir}`} onClick={() => dispatch({ type: 'ALIGN_SELECTED', payload: dir })}
                                                className="flex-1 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors cursor-pointer">
                                                <Icon size={13} />
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-1 bg-white/[0.02] border border-white/8 rounded-lg p-1">
                                        {([
                                            ['front', BringToFront, 'Bring to front'], ['forward', ChevronsUp, 'Forward'],
                                            ['backward', ChevronsDown, 'Backward'], ['back', SendToBack, 'Send to back'],
                                        ] as const).map(([mode, Icon, title]) => (
                                            <button key={mode} title={title} onClick={() => dispatch({ type: 'REORDER_Z', payload: mode })}
                                                className="flex-1 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors cursor-pointer">
                                                <Icon size={13} />
                                            </button>
                                        ))}
                                    </div>
                                    {selectedWidgetIds.length >= 3 && (
                                        <div className="flex items-center gap-1 bg-white/[0.02] border border-white/8 rounded-lg p-1">
                                            {([
                                                ['horizontal', AlignHorizontalDistributeCenter, 'Distribute horizontally'],
                                                ['vertical', AlignVerticalDistributeCenter, 'Distribute vertically'],
                                            ] as const).map(([dir, Icon, title]) => (
                                                <button key={dir} title={title} onClick={() => dispatch({ type: 'DISTRIBUTE_SELECTED', payload: dir })}
                                                    className="flex-1 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors cursor-pointer">
                                                    <Icon size={13} />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Typography (not shown for alert or bundle widgets) */}
                            {selectedWidget.type !== 'alert' && !isBundleWidget(selectedWidget.type) && (
                                <section className="space-y-3 pt-4 border-t border-white/[0.05]">
                                    <p className={sectionHeading}>Typography</p>
                                    <div>
                                        <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block mb-1.5">Font</label>
                                        <select
                                            className={selectCls}
                                            value={selectedWidget.styles.fontFamily || 'Inter'}
                                            onChange={(e) => dispatch({ type: 'UPDATE_WIDGET_STYLE', payload: { id: selectedWidget.id, styles: { fontFamily: e.target.value } } })}
                                        >
                                            {['Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Poppins', 'Playfair Display', 'Oswald', 'Raleway', 'Bangers', 'Bebas Neue'].map(f => (
                                                <option key={f} value={f}>{f}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <InputBox label="Size" value={selectedWidget.styles.fontSize || 16} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET_STYLE', payload: { id: selectedWidget.id, styles: { fontSize: Number(v) } } })} />
                                        <div>
                                            <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block mb-1.5">Color</label>
                                            <div className="flex items-center gap-2 bg-white/[0.03] border border-white/8 rounded-lg px-2 py-1.5 h-[30px]">
                                                <input
                                                    type="color"
                                                    className="w-4 h-4 rounded bg-transparent border-0 p-0 cursor-pointer"
                                                    value={selectedWidget.styles.color || '#ffffff'}
                                                    onChange={(e) => dispatch({ type: 'UPDATE_WIDGET_STYLE', payload: { id: selectedWidget.id, styles: { color: e.target.value } } })}
                                                />
                                                <span className="text-[9px] font-mono text-zinc-500 uppercase">{selectedWidget.styles.color || '#fff'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* Visual (not shown for alert or bundle widgets) */}
                            {selectedWidget.type !== 'alert' && !isBundleWidget(selectedWidget.type) && (
                                <section className="space-y-3 pt-4 border-t border-white/[0.05]">
                                    <p className={sectionHeading}>Visual</p>
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest">Opacity</label>
                                            <span className="text-[9px] text-zinc-600 tabular-nums">{Math.round((selectedWidget.styles.opacity ?? 1) * 100)}%</span>
                                        </div>
                                        <input
                                            type="range" min="0" max="1" step="0.01"
                                            className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-brand-primary"
                                            value={selectedWidget.styles.opacity ?? 1}
                                            onChange={(e) => dispatch({ type: 'UPDATE_WIDGET_STYLE', payload: { id: selectedWidget.id, styles: { opacity: Number(e.target.value) } } })}
                                        />
                                    </div>
                                </section>
                            )}

                            {/* Widget-specific */}
                            {selectedWidget.type === 'text' && (
                                <section className="space-y-3 pt-4 border-t border-white/[0.05]">
                                    <div className="flex items-center gap-2">
                                        <Type size={12} className="text-brand-primary" />
                                        <p className={sectionHeading}>Text content</p>
                                    </div>
                                    <textarea
                                        className={`${inputCls} resize-none h-20`}
                                        value={selectedWidget.config.text || ''}
                                        onChange={(e) => dispatch({ type: 'UPDATE_WIDGET_CONFIG', payload: { id: selectedWidget.id, config: { text: e.target.value } } })}
                                        placeholder="Enter text…"
                                    />
                                    <InputBox label="Weight" value={selectedWidget.styles.fontWeight || 700} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET_STYLE', payload: { id: selectedWidget.id, styles: { fontWeight: Number(v) } } })} />
                                </section>
                            )}

                            {selectedWidget.type === 'label' && (
                                <section className="space-y-3 pt-4 border-t border-white/[0.05]">
                                    <p className={sectionHeading}>Label</p>
                                    <div>
                                        <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block mb-1.5">Title</label>
                                        <input className={inputCls} value={selectedWidget.config.labelTitle || ''} placeholder="Recent Follower…" onChange={(e) => dispatch({ type: 'UPDATE_WIDGET_CONFIG', payload: { id: selectedWidget.id, config: { labelTitle: e.target.value } } })} />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block mb-1.5">Value</label>
                                        <input className={inputCls} value={selectedWidget.config.value || ''} placeholder="None…" onChange={(e) => dispatch({ type: 'UPDATE_WIDGET_CONFIG', payload: { id: selectedWidget.id, config: { value: e.target.value } } })} />
                                    </div>
                                </section>
                            )}

                            {selectedWidget.type === 'chat' && (
                                <ChatPanel widget={selectedWidget} overlayId={state.overlay?.id} />
                            )}

                            {selectedWidget.type === 'alert' && (
                                <AlertSidebarPanel
                                    widget={selectedWidget}
                                    overlayId={state.overlay?.id}
                                    onOpenEditor={() => setShowAlertModal(true)}
                                />
                            )}

                            {selectedWidget.type === 'eventlist' && (
                                <section className="space-y-3 pt-4 border-t border-white/[0.05]">
                                    <div className="flex items-center gap-2">
                                        <ScrollText size={12} className="text-brand-primary" />
                                        <p className={sectionHeading}>Event List</p>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block mb-1.5">Title</label>
                                        <input className={inputCls} value={selectedWidget.config.title || ''} placeholder="Recent Events" onChange={(e) => dispatch({ type: 'UPDATE_WIDGET_CONFIG', payload: { id: selectedWidget.id, config: { title: e.target.value } } })} />
                                    </div>
                                    <InputBox label="Max items" value={selectedWidget.config.max ?? 5} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET_CONFIG', payload: { id: selectedWidget.id, config: { max: Math.max(1, Number(v)) } } })} />
                                    <TestButton label="Fire test event" icon={<Zap size={12} />} onClick={async () => {
                                        if (!state.overlay?.id) return;
                                        await fetch(apiUrl(`/api/overlays/${state.overlay.id}/test-alert`), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'follow' }) });
                                    }} />
                                </section>
                            )}

                            {isBundleWidget(selectedWidget.type) && (
                                <BundleFieldsPanel widget={selectedWidget} />
                            )}

                            {selectedWidget.type === 'image' && (
                                <ImagePanel widget={selectedWidget} />
                            )}

                            {selectedWidget.type === 'goal' && (
                                <section className="space-y-3 pt-4 border-t border-white/[0.05]">
                                    <p className={sectionHeading}>Goal</p>
                                    <div>
                                        <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block mb-1.5">Title</label>
                                        <input className={inputCls} value={selectedWidget.config.title || ''} placeholder="Follower Goal" onChange={(e) => dispatch({ type: 'UPDATE_WIDGET_CONFIG', payload: { id: selectedWidget.id, config: { title: e.target.value } } })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <InputBox label="Target" value={selectedWidget.config.target || 100} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET_CONFIG', payload: { id: selectedWidget.id, config: { target: Number(v) } } })} />
                                        <div>
                                            <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block mb-1.5">Bar color</label>
                                            <input type="color" className="w-full h-[30px] rounded-lg border border-white/8 p-1 cursor-pointer bg-white/[0.03]" value={selectedWidget.styles.barColor || '#3faaff'} onChange={(e) => dispatch({ type: 'UPDATE_WIDGET_STYLE', payload: { id: selectedWidget.id, styles: { barColor: e.target.value } } })} />
                                        </div>
                                    </div>
                                </section>
                            )}
                        </>
                    ) : selectedWidget && propTab === 'animation' ? (
                        <AnimationPanel widget={selectedWidget} />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center py-8 opacity-30">
                            <MousePointer2 size={28} className="mb-3 text-zinc-600" />
                            <p className="text-[10px] text-zinc-600 font-medium leading-relaxed">Select a layer<br />to edit {propTab === 'animation' ? 'animation' : 'properties'}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Alert editor modal */}
            {showAlertModal && selectedWidget?.type === 'alert' && (
                <AlertEditorModal widget={selectedWidget} onClose={() => setShowAlertModal(false)} />
            )}

            {/* ── Quick Add ── */}
            <div className="px-3 py-3 border-t border-white/5 bg-white/[0.01] shrink-0">
                <p className={`${sectionHeading} mb-2.5 px-1`}>Quick add</p>
                <div className="grid grid-cols-6 gap-1.5">
                    <AddButton icon={<Type size={13} />} label="Text" onClick={() => dispatch({ type: 'ADD_WIDGET', payload: { type: 'text', baseConfig: { text: 'New Text', name: 'Text' } } })} />
                    <AddButton icon={<ImageIcon size={13} />} label="Image" onClick={() => dispatch({ type: 'ADD_WIDGET', payload: { type: 'image', baseConfig: { name: 'Image' } } })} />
                    <AddButton icon={<MessageSquare size={13} />} label="Chat" onClick={() => dispatch({ type: 'ADD_WIDGET', payload: { type: 'chat', baseConfig: { name: 'Chat Box' } } })} />
                    <AddButton icon={<Bell size={13} />} label="Alert" onClick={() => dispatch({
                        type: 'ADD_WIDGET',
                        payload: {
                            type: 'alert',
                            width: 840,
                            height: 480,
                            baseConfig: {
                                name: 'Alert Box',
                                htmlTemplate: DEFAULT_ALERT_HTML,
                                customCss: DEFAULT_ALERT_CSS,
                                customJs: DEFAULT_ALERT_JS,
                                duration: 5000,
                                events: { follow: true, subscribe: true, cheer: true, raid: true, donation: true },
                            }
                        }
                    })} />
                    <AddButton icon={<Zap size={13} />} label="Goal" onClick={() => dispatch({ type: 'ADD_WIDGET', payload: { type: 'goal', baseConfig: { title: 'Follower Goal', target: 100, goalType: 'follows', name: 'Goal' } } })} />
                    <AddButton icon={<Layers size={13} />} label="Label" onClick={() => dispatch({ type: 'ADD_WIDGET', payload: { type: 'label', baseConfig: { labelTitle: 'Recent Follower', value: 'None', name: 'Label' } } })} />
                    <AddButton icon={<ScrollText size={13} />} label="Events" onClick={() => dispatch({ type: 'ADD_WIDGET', payload: { type: 'eventlist', width: 320, height: 300, baseConfig: { name: 'Event List', title: 'Recent Events', max: 5 } } })} />

                    {/* Bundle widgets (the widget standard) — palette generated from the registry. */}
                    {paletteWidgets().filter(d => d.renderMode === 'bundle').map(def => (
                        <AddButton
                            key={def.type}
                            icon={<Layers size={13} />}
                            label={def.name}
                            onClick={() => dispatch({
                                type: 'ADD_WIDGET',
                                payload: {
                                    type: def.type,
                                    width: def.defaultSize.width,
                                    height: def.defaultSize.height,
                                    baseConfig: { ...defaultFieldData(def), name: def.name },
                                },
                            })}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function AlertSidebarPanel({
    widget,
    overlayId,
    onOpenEditor,
}: {
    widget: Widget;
    overlayId?: string;
    onOpenEditor: () => void;
}) {
    return (
        <section className="space-y-4 pt-4 border-t border-white/[0.05]">
            <div className="flex items-center gap-2">
                <Bell size={12} className="text-brand-primary" />
                <p className={sectionHeading}>Alert Box</p>
            </div>

            {/* Event status overview */}
            <div className="space-y-2">
                <p className="text-[9px] font-black text-zinc-700 uppercase tracking-widest">Events</p>
                <div className="flex flex-wrap gap-1.5">
                    {QUICK_EVENTS.map(({ key, label }) => {
                        const cfg = getAlertEventConfig(widget.config, key);
                        return (
                            <div
                                key={key}
                                className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${
                                    cfg.enabled
                                        ? 'text-brand-primary bg-brand-primary/10 border-brand-primary/20'
                                        : 'text-zinc-700 bg-white/[0.02] border-white/5'
                                }`}
                            >
                                <span className={`w-1 h-1 rounded-full ${cfg.enabled ? 'bg-brand-primary' : 'bg-zinc-700'}`} />
                                {label}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Open editor */}
            <button
                onClick={onOpenEditor}
                className="w-full flex items-center justify-between px-4 py-3 bg-brand-primary/[0.07] hover:bg-brand-primary/15 border border-brand-primary/20 rounded-xl text-brand-primary text-[10px] font-black uppercase tracking-wider transition-[background-color] duration-150 cursor-pointer group"
            >
                <div className="flex items-center gap-2">
                    <Code2 size={12} />
                    Edit HTML / CSS / JS
                </div>
                <ChevronRight size={12} className="opacity-40 group-hover:opacity-100 transition-opacity" />
            </button>

            {/* Quick test buttons (enabled events only) */}
            <div className="space-y-2">
                <p className="text-[9px] font-black text-zinc-700 uppercase tracking-widest">Quick test</p>
                <div className="grid grid-cols-3 gap-1.5">
                    {QUICK_EVENTS.filter(({ key }) => getAlertEventConfig(widget.config, key).enabled).map(({ key, label, preview }) => (
                        <button
                            key={key}
                            onClick={async () => {
                                if (!overlayId) return;
                                await fetch(apiUrl(`/api/overlays/${overlayId}/test-alert`), {
                                    method: 'POST',
                                    credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(preview),
                                });
                            }}
                            className="flex items-center justify-center gap-1 py-2 bg-white/[0.02] hover:bg-brand-primary/10 border border-white/5 hover:border-brand-primary/25 rounded-xl text-zinc-600 hover:text-brand-primary text-[9px] font-black uppercase tracking-wider transition-[background-color,border-color,color] duration-150 cursor-pointer"
                        >
                            <Zap size={9} />
                            {label}
                        </button>
                    ))}
                </div>
            </div>
        </section>
    );
}

// Auto-generated properties for a bundle widget, driven by its registry `fields`.
// This is the standard: new bundle widgets get a full editor panel with no code here.
function BundleFieldsPanel({ widget }: { widget: Widget }) {
    const { dispatch } = useEditor();
    const def = getWidgetDefinition(widget.type);
    if (!def) return null;
    const setField = (key: string, value: any) =>
        dispatch({ type: 'UPDATE_WIDGET_CONFIG', payload: { id: widget.id, config: { [key]: value } } });

    return (
        <section className="space-y-3 pt-4 border-t border-white/[0.05]">
            <p className={sectionHeading}>{def.name}</p>
            {Object.entries(def.fields).map(([key, field]) => (
                <FieldControl
                    key={key}
                    field={field}
                    value={widget.config[key] ?? (field as { value?: any }).value}
                    onChange={(v) => setField(key, v)}
                />
            ))}
        </section>
    );
}

function FieldControl({ field, value, onChange }: { field: Field; value: any; onChange: (v: any) => void }) {
    const label = (
        <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block mb-1.5">{field.label}</label>
    );
    switch (field.type) {
        case 'dropdown':
            return (
                <div>{label}
                    <select className={selectCls} value={value ?? field.value} onChange={(e) => onChange(e.target.value)}>
                        {Object.entries(field.options).map(([val, name]) => <option key={val} value={val}>{name}</option>)}
                    </select>
                </div>
            );
        case 'checkbox':
            return (
                <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-[9px] font-black text-zinc-700 uppercase tracking-widest">{field.label}</span>
                    <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="accent-brand-primary cursor-pointer" />
                </label>
            );
        case 'color':
            return (
                <div>{label}
                    <input type="color" className="w-full h-[30px] rounded-lg border border-white/8 p-1 cursor-pointer bg-white/[0.03]" value={value ?? field.value} onChange={(e) => onChange(e.target.value)} />
                </div>
            );
        case 'number':
        case 'slider':
            return (
                <div>{label}
                    <input type="number" className={inputCls} value={value ?? field.value}
                        min={(field as any).min} max={(field as any).max} step={(field as any).step}
                        onChange={(e) => onChange(Number(e.target.value))} />
                </div>
            );
        case 'textarea':
            return (
                <div>{label}
                    <textarea className={`${inputCls} resize-none h-20`} value={value ?? field.value ?? ''} onChange={(e) => onChange(e.target.value)} />
                </div>
            );
        case 'image':
        case 'font':
        case 'text':
        default:
            return (
                <div>{label}
                    <input className={inputCls} value={value ?? (field as any).value ?? ''} placeholder={(field as any).placeholder}
                        onChange={(e) => onChange(e.target.value)} />
                </div>
            );
    }
}

function ChatPanel({ widget, overlayId }: { widget: Widget; overlayId?: string }) {
    const { dispatch } = useEditor();
    const cfg = getChatConfig(widget.config);
    const set = <K extends keyof ChatConfig>(key: K, value: ChatConfig[K]) =>
        dispatch({ type: 'UPDATE_WIDGET_CONFIG', payload: { id: widget.id, config: { [key]: value } } });

    const togglePlatform = (id: ChatPlatform) => {
        const has = cfg.platforms.includes(id);
        const next = has ? cfg.platforms.filter(p => p !== id) : [...cfg.platforms, id];
        set('platforms', next.length ? next : cfg.platforms); // keep at least one
    };

    return (
        <section className="space-y-4 pt-4 border-t border-white/[0.05]">
            <div className="flex items-center gap-2">
                <MessageSquare size={12} className="text-brand-primary" />
                <p className={sectionHeading}>Chat</p>
            </div>

            {/* Platforms */}
            <div className="space-y-1.5">
                <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block">Sources</label>
                <div className="grid grid-cols-2 gap-1.5">
                    {PLATFORMS.map(p => {
                        const on = cfg.platforms.includes(p.id);
                        return (
                            <button
                                key={p.id}
                                onClick={() => togglePlatform(p.id)}
                                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                                    on ? 'bg-white/[0.04] border-white/15 text-white' : 'bg-white/[0.01] border-white/5 text-zinc-600 hover:text-zinc-400'
                                }`}
                            >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? p.color : '#3f3f46' }} />
                                {p.label}
                            </button>
                        );
                    })}
                </div>
                {cfg.platforms.some(p => p !== 'twitch') && (
                    <p className="text-[9px] text-amber-500/80 leading-relaxed">YouTube / Kick / TikTok require connecting those accounts in Integrations. Twitch is live now.</p>
                )}
            </div>

            {/* Behaviour toggles */}
            <div className="space-y-2 pt-1">
                <ToggleRow label="Hide commands (!…)" checked={cfg.hideCommands} onChange={v => set('hideCommands', v)} />
                <ToggleRow label="Hide bot accounts" checked={cfg.hideBots} onChange={v => set('hideBots', v)} />
                <ToggleRow label="Show platform icon" checked={cfg.showPlatformIcons} onChange={v => set('showPlatformIcons', v)} />
                {cfg.showPlatformIcons && (
                    <ToggleRow label="Use brand logo (vs dot)" checked={cfg.platformLogos} onChange={v => set('platformLogos', v)} />
                )}
                <ToggleRow label="Show badges" checked={cfg.showBadges} onChange={v => set('showBadges', v)} />
                <ToggleRow label="Render emotes" checked={cfg.showEmotes} onChange={v => set('showEmotes', v)} />
            </div>

            {/* Numbers */}
            <div className="grid grid-cols-2 gap-2">
                <InputBox label="Max msgs" value={cfg.maxMessages} onChange={v => set('maxMessages', Math.max(1, Number(v)))} />
                <InputBox label="Fade (s)" value={cfg.messageLifetime} onChange={v => set('messageLifetime', Math.max(0, Number(v)))} />
                <InputBox label="Font size" value={cfg.fontSize} onChange={v => set('fontSize', Math.max(8, Number(v)))} />
                <InputBox label="Radius" value={widget.styles.borderRadius || 0} onChange={v => dispatch({ type: 'UPDATE_WIDGET_STYLE', payload: { id: widget.id, styles: { borderRadius: Number(v) } } })} />
            </div>

            {/* Colours */}
            <div className="space-y-2">
                <div>
                    <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block mb-1.5">Username colour</label>
                    <select className={selectCls} value={cfg.usernameColor} onChange={e => set('usernameColor', e.target.value as ChatConfig['usernameColor'])}>
                        <option value="platform">Per platform</option>
                        <option value="user">User&apos;s own colour</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>
                {cfg.usernameColor === 'custom' && (
                    <ColorRow label="Name colour" value={cfg.customUsernameColor} onChange={v => set('customUsernameColor', v)} />
                )}
                <ColorRow label="Text colour" value={cfg.textColor} onChange={v => set('textColor', v)} />
                <ColorRow label="Background" value={cfg.backgroundColor.startsWith('#') ? cfg.backgroundColor : '#000000'} onChange={v => set('backgroundColor', v)} />
            </div>

            <TestButton label="Send test message" icon={<Zap size={12} />} onClick={async () => {
                if (!overlayId) return;
                await fetch(apiUrl(`/api/overlays/${overlayId}/test-chat`), { method: 'POST', credentials: 'include' });
            }} />
        </section>
    );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex items-center justify-between cursor-pointer">
            <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">{label}</span>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-brand-primary cursor-pointer" />
        </label>
    );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <div className="flex items-center justify-between">
            <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest">{label}</label>
            <div className="flex items-center gap-2">
                <input type="color" className="w-5 h-5 rounded bg-transparent border-0 p-0 cursor-pointer" value={value} onChange={e => onChange(e.target.value)} />
                <span className="text-[9px] font-mono text-zinc-600 uppercase">{value}</span>
            </div>
        </div>
    );
}

function ImagePanel({ widget }: { widget: Widget }) {
    const { dispatch } = useEditor();
    const setSrc = (src: string) => dispatch({ type: 'UPDATE_WIDGET_CONFIG', payload: { id: widget.id, config: { src } } });
    const setFit = (objectFit: string) => dispatch({ type: 'UPDATE_WIDGET_STYLE', payload: { id: widget.id, styles: { objectFit } } });

    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // ponytail: no asset-upload backend, so embed as a data URL. Fine for logos/badges;
        // add an upload endpoint if users drop in large photos and bloat the saved config.
        if (file.size > 1_500_000) { alert('Image too large (max ~1.5MB). Paste a URL instead.'); return; }
        const reader = new FileReader();
        reader.onload = () => setSrc(String(reader.result));
        reader.readAsDataURL(file);
    };

    return (
        <section className="space-y-3 pt-4 border-t border-white/[0.05]">
            <div className="flex items-center gap-2">
                <ImageIcon size={12} className="text-brand-primary" />
                <p className={sectionHeading}>Image</p>
            </div>
            {widget.config.src && (
                <img src={widget.config.src} alt="" className="w-full h-20 object-contain rounded-lg border border-white/8 bg-black/20" />
            )}
            <div>
                <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block mb-1.5">Image URL</label>
                <input className={inputCls} value={widget.config.src?.startsWith('data:') ? '' : (widget.config.src || '')} placeholder="https://…" onChange={(e) => setSrc(e.target.value)} />
            </div>
            <label className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/[0.02] hover:bg-brand-primary/10 border border-white/8 hover:border-brand-primary/25 rounded-xl text-zinc-500 hover:text-brand-primary text-[10px] font-black uppercase tracking-wider transition-colors duration-150 cursor-pointer">
                <Plus size={12} /> Upload file
                <input type="file" accept="image/*" className="hidden" onChange={onFile} />
            </label>
            <div>
                <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block mb-1.5">Fit</label>
                <select className={selectCls} value={widget.styles.objectFit || 'cover'} onChange={(e) => setFit(e.target.value)}>
                    <option value="cover">Cover</option>
                    <option value="contain">Contain</option>
                    <option value="fill">Stretch</option>
                </select>
            </div>
        </section>
    );
}

function AnimationPanel({ widget }: { widget: Widget }) {
    const { dispatch } = useEditor();
    const anim: AnimationConfig = widget.config.animation || {};
    const set = (patch: Partial<AnimationConfig>) =>
        dispatch({ type: 'UPDATE_WIDGET_CONFIG', payload: { id: widget.id, config: { animation: { ...anim, ...patch } } } });

    const inOn = !!anim.in && anim.in !== 'none';
    const loopOn = !!anim.loop && anim.loop !== 'none';

    return (
        <div className="space-y-5">
            {/* Entrance */}
            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <Zap size={12} className="text-brand-primary" />
                    <p className={sectionHeading}>Entrance</p>
                </div>
                <select className={selectCls} value={anim.in || 'none'} onChange={(e) => set({ in: e.target.value })}>
                    {ENTRANCE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {inOn && (
                    <div className="grid grid-cols-2 gap-2">
                        <InputBox label="Dur (ms)" value={anim.inDuration ?? 600} onChange={(v) => set({ inDuration: Number(v) })} />
                        <InputBox label="Delay (ms)" value={anim.inDelay ?? 0} onChange={(v) => set({ inDelay: Number(v) })} />
                    </div>
                )}
            </section>

            {/* Idle loop */}
            <section className="space-y-3 pt-4 border-t border-white/[0.05]">
                <div className="flex items-center gap-2">
                    <MonitorPlay size={12} className="text-brand-primary" />
                    <p className={sectionHeading}>Idle loop</p>
                </div>
                <select className={selectCls} value={anim.loop || 'none'} onChange={(e) => set({ loop: e.target.value })}>
                    {LOOP_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {loopOn && (
                    <InputBox label="Cycle (ms)" value={anim.loopDuration ?? 2600} onChange={(v) => set({ loopDuration: Number(v) })} />
                )}
            </section>

            <p className="text-[10px] text-zinc-600 leading-relaxed pt-2 border-t border-white/[0.05]">
                Entrance plays once when the overlay loads; the idle loop runs continuously after.
                Changing a setting replays it here in the editor.
            </p>
        </div>
    );
}

function LayerRow({ widget, isSelected, isDragging, onDragStartRow, onDragEndRow, onDropRow }: {
    widget: Widget;
    isSelected: boolean;
    isDragging: boolean;
    onDragStartRow: () => void;
    onDragEndRow: () => void;
    onDropRow: () => void;
}) {
    const { dispatch } = useEditor();
    const [isOver, setIsOver] = useState(false);
    const icons: Record<string, any> = { chat: MessageSquare, alert: Bell, text: Type, image: ImageIcon, video: MonitorPlay, eventlist: ScrollText, goal: Zap, 'tcg-pack': Layers };
    const Icon = icons[widget.type] || Square;

    return (
        <div
            draggable
            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStartRow(); }}
            onDragEnd={() => { setIsOver(false); onDragEndRow(); }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!isDragging) setIsOver(true); }}
            onDragLeave={() => setIsOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsOver(false); onDropRow(); }}
            onClick={() => dispatch({ type: 'SELECT_WIDGET', payload: { id: widget.id, multi: false } })}
            className={`group flex items-center gap-2.5 px-2 py-2 rounded-xl transition-[background-color,border-color] duration-150 cursor-pointer border ${
                isDragging ? 'opacity-40' : ''
            } ${
                isOver ? 'border-brand-primary/60 bg-brand-primary/5' :
                isSelected
                    ? 'bg-brand-primary/10 border-brand-primary/25 text-white'
                    : 'hover:bg-white/[0.03] border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
        >
            <GripVertical size={10} className="opacity-20 group-hover:opacity-50 transition-opacity cursor-grab shrink-0" />
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                isSelected ? 'bg-brand-primary text-[#05070a]' : 'bg-white/[0.04] text-zinc-600'
            }`}>
                <Icon size={12} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold tracking-tight truncate capitalize">
                    {widget.config.name || widget.type}
                </p>
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                    onClick={(e) => { e.stopPropagation(); dispatch({ type: 'UPDATE_WIDGET', payload: { id: widget.id, updates: { isVisible: !widget.isVisible } } }); }}
                    className={`w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/8 transition-colors cursor-pointer ${widget.isVisible ? 'text-zinc-500' : 'text-zinc-700'}`}
                    aria-label={widget.isVisible ? 'Hide layer' : 'Show layer'}
                >
                    {widget.isVisible ? <Eye size={11} /> : <EyeOff size={11} />}
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); dispatch({ type: 'UPDATE_WIDGET', payload: { id: widget.id, updates: { isLocked: !widget.isLocked } } }); }}
                    className={`w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/8 transition-colors cursor-pointer ${widget.isLocked ? 'text-zinc-500' : 'text-zinc-700'}`}
                    aria-label={widget.isLocked ? 'Unlock layer' : 'Lock layer'}
                >
                    {widget.isLocked ? <Lock size={11} /> : <Unlock size={11} />}
                </button>
            </div>
        </div>
    );
}

function InputBox({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
    return (
        <div>
            <label className="text-[9px] font-black text-zinc-700 uppercase tracking-widest block mb-1.5">{label}</label>
            <div className="relative">
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-zinc-700 pointer-events-none uppercase">{label[0]}</div>
                <input
                    type="number"
                    className="w-full bg-white/[0.03] border border-white/8 rounded-lg pl-5 pr-2 py-1.5 text-[11px] text-white font-bold focus:outline-none focus:border-brand-primary/50 transition-[border-color] duration-150"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>
        </div>
    );
}

function AddButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            title={label}
            aria-label={`Add ${label} widget`}
            className="flex items-center justify-center p-2.5 bg-white/[0.02] hover:bg-brand-primary/10 border border-white/5 hover:border-brand-primary/25 rounded-xl transition-[background-color,border-color] duration-150 text-zinc-600 hover:text-brand-primary cursor-pointer"
        >
            {icon}
        </button>
    );
}

function TestButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-primary/[0.07] hover:bg-brand-primary/15 border border-brand-primary/20 rounded-xl text-brand-primary text-[10px] font-black uppercase tracking-wider transition-[background-color] duration-150 active:scale-95 cursor-pointer"
        >
            {icon}
            {label}
        </button>
    );
}

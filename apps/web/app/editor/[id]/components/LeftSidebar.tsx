'use client';

import { useEditor, Widget } from '../store';
import {
    Plus, Layers, Type, MessageSquare, Bell, Image as ImageIcon,
    Eye, EyeOff, Lock, Unlock, GripVertical, Settings,
    Zap, Palette, Maximize, Move, MousePointer2, MonitorPlay, Square
} from 'lucide-react';

export function LeftSidebar() {
    const { state, dispatch } = useEditor();
    const { widgets, selectedWidgetIds } = state;

    const selectedWidget = widgets.find(w => selectedWidgetIds.includes(w.id));

    return (
        <div className="w-80 bg-neutral-900 flex flex-col border-r border-white/5 shadow-2xl z-20 overflow-hidden">
            {/* Layers Section */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Layers size={14} className="text-purple-400" />
                        <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-400">Layers</h2>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
                    {widgets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-6 text-center opacity-30">
                            <Plus size={32} className="mb-3" />
                            <p className="text-xs font-medium italic">No layers yet.<br />Add a widget to start.</p>
                        </div>
                    ) : (
                        [...widgets].sort((a, b) => b.layer - a.layer).map((widget) => (
                            <LayerRow
                                key={widget.id}
                                widget={widget}
                                isSelected={selectedWidgetIds.includes(widget.id)}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* Properties Panel (Tabbed or Contextual) */}
            <div className="h-[55%] border-t border-white/5 flex flex-col bg-neutral-900/50 backdrop-blur-sm">
                <div className="px-4 py-2 border-b border-white/5 bg-black/20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button className="text-[10px] font-black uppercase tracking-[0.15em] text-purple-400 border-b-2 border-purple-500 pb-2 -mb-2">Properties</button>
                        <button className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-600 pb-2 -mb-2 hover:text-neutral-400 font-medium">Animation</button>
                    </div>
                    <Settings size={14} className="text-neutral-600" />
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                    {selectedWidget ? (
                        <>
                            <section>
                                <div className="flex items-center gap-2 mb-4">
                                    <Settings size={14} className="text-purple-400" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-200">Element Settings</h3>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[9px] font-black text-neutral-500 uppercase tracking-widest block mb-2">Layer Name</label>
                                        <input
                                            className="w-full bg-black/40 border border-white/5 rounded-md px-3 py-2 text-xs text-white focus:border-purple-500/50 outline-none transition-all"
                                            value={selectedWidget.config.name || selectedWidget.type}
                                            onChange={(e) => dispatch({
                                                type: 'UPDATE_WIDGET_CONFIG',
                                                payload: { id: selectedWidget.id, config: { name: e.target.value } }
                                            })}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <InputBox label="X Position" unit="X" value={Math.round(selectedWidget.x)} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { x: Number(v) } } })} />
                                        <InputBox label="Y Position" unit="Y" value={Math.round(selectedWidget.y)} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { y: Number(v) } } })} />
                                        <InputBox label="Width" unit="W" value={Math.round(selectedWidget.width)} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { width: Number(v) } } })} />
                                        <InputBox label="Height" unit="H" value={Math.round(selectedWidget.height)} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { height: Number(v) } } })} />
                                    </div>
                                </div>
                            </section>

                            {/* Widget Specific Editor */}
                            {selectedWidget.type === 'text' && (
                                <section className="pt-4 border-t border-white/5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Type size={14} className="text-purple-400" />
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-200">Text Settings</h3>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[9px] font-black text-neutral-500 uppercase tracking-widest block mb-2">Content</label>
                                            <textarea
                                                className="w-full bg-black/40 border border-white/5 rounded-md px-3 py-2 text-xs text-white focus:border-purple-500/50 outline-none transition-all resize-none h-20"
                                                value={selectedWidget.config.text || 'Enter text here...'}
                                                onChange={(e) => dispatch({
                                                    type: 'UPDATE_WIDGET_CONFIG',
                                                    payload: { id: selectedWidget.id, config: { text: e.target.value } }
                                                })}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <InputBox label="Font Size" unit="Size" value={selectedWidget.styles.fontSize || 24} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET_STYLE', payload: { id: selectedWidget.id, styles: { fontSize: Number(v) } } })} />
                                            <InputBox label="Weight" unit="Wt" value={selectedWidget.styles.fontWeight || 700} onChange={(v) => dispatch({ type: 'UPDATE_WIDGET_STYLE', payload: { id: selectedWidget.id, styles: { fontWeight: Number(v) } } })} />
                                        </div>
                                    </div>
                                </section>
                            )}

                            <section className="pt-4 border-t border-white/5">
                                <div className="flex items-center gap-2 mb-4">
                                    <Palette size={14} className="text-purple-400" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-200">Visual Styles</h3>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Color</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                className="w-6 h-6 rounded bg-transparent border-0 p-0 cursor-pointer overflow-hidden"
                                                value={selectedWidget.styles.color || '#ffffff'}
                                                onChange={(e) => dispatch({
                                                    type: 'UPDATE_WIDGET_STYLE',
                                                    payload: { id: selectedWidget.id, styles: { color: e.target.value } }
                                                })}
                                            />
                                            <span className="text-[10px] font-mono text-neutral-500 uppercase">{selectedWidget.styles.color || '#ffffff'}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-[10px] text-neutral-500 mb-2">
                                            <span className="font-bold uppercase tracking-wider">Opacity</span>
                                            <span>{Math.round((selectedWidget.styles.opacity ?? 1) * 100)}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.01"
                                            className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-purple-500"
                                            value={selectedWidget.styles.opacity ?? 1}
                                            onChange={(e) => dispatch({
                                                type: 'UPDATE_WIDGET_STYLE',
                                                payload: { id: selectedWidget.id, styles: { opacity: Number(e.target.value) } }
                                            })}
                                        />
                                    </div>
                                </div>
                            </section>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-20">
                            <MousePointer2 size={40} className="mb-4" />
                            <p className="text-xs font-medium italic">Select a layer to edit properties</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Shortcuts Footer */}
            <div className="p-4 bg-black/30 border-t border-white/5">
                <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600 mb-3 ml-1">Quick Add</h3>
                <div className="grid grid-cols-4 gap-2">
                    <MiniShortcutButton icon={<Type size={14} />} onClick={() => dispatch({ type: 'ADD_WIDGET', payload: { type: 'text', baseConfig: { text: 'New Text', name: 'Text Layer' } } })} />
                    <MiniShortcutButton icon={<ImageIcon size={14} />} onClick={() => dispatch({ type: 'ADD_WIDGET', payload: { type: 'image', baseConfig: { name: 'Image Layer' } } })} />
                    <MiniShortcutButton icon={<MessageSquare size={14} />} onClick={() => dispatch({ type: 'ADD_WIDGET', payload: { type: 'chat', baseConfig: { name: 'Chat Box' } } })} />
                    <MiniShortcutButton icon={<Bell size={14} />} onClick={() => dispatch({ type: 'ADD_WIDGET', payload: { type: 'alert', baseConfig: { name: 'Alert Box' } } })} />
                </div>
            </div>
        </div>
    );
}

function LayerRow({ widget, isSelected }: { widget: Widget; isSelected: boolean }) {
    const { dispatch } = useEditor();

    const icons: Record<string, any> = {
        chat: MessageSquare,
        alert: Bell,
        text: Type,
        image: ImageIcon,
        video: MonitorPlay,
    };
    const Icon = icons[widget.type] || Square;

    return (
        <div
            onClick={() => dispatch({ type: 'SELECT_WIDGET', payload: { id: widget.id, multi: false } })}
            className={`group flex items-center gap-3 p-1.5 rounded-lg transition-all cursor-pointer border ${isSelected
                ? 'bg-purple-600/20 border-purple-500/50 text-white'
                : 'hover:bg-white/5 border-transparent text-neutral-500 hover:text-neutral-300'
                }`}
        >
            <GripVertical size={12} className="opacity-0 group-hover:opacity-30 transition-opacity cursor-grab active:cursor-grabbing" />

            <div className={`p-1.5 rounded-md ${isSelected ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40' : 'bg-neutral-800 text-neutral-400'}`}>
                <Icon size={14} />
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black tracking-tight truncate leading-none capitalize">
                    {widget.config.name || `${widget.type} Box`}
                </p>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'UPDATE_WIDGET', payload: { id: widget.id, updates: { isVisible: !widget.isVisible } } });
                    }}
                    className={`p-1.5 hover:bg-white/10 rounded transition-colors ${widget.isVisible ? 'text-neutral-500' : 'text-neutral-700'}`}
                >
                    {widget.isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'UPDATE_WIDGET', payload: { id: widget.id, updates: { isLocked: !widget.isLocked } } });
                    }}
                    className={`p-1.5 hover:bg-white/10 rounded transition-colors ${widget.isLocked ? 'text-neutral-500' : 'text-neutral-700'}`}
                >
                    {widget.isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                </button>
            </div>
        </div>
    );
}

function InputBox({ label, unit, value, onChange }: { label: string; unit: string; value: any; onChange: (v: string) => void }) {
    return (
        <div>
            <label className="text-[9px] font-black text-neutral-600 uppercase tracking-widest block mb-1.5">{label}</label>
            <div className="relative group">
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-neutral-700 group-focus-within:text-purple-500 transition-colors uppercase">{unit}</div>
                <input
                    type="number"
                    className="w-full bg-black/40 border border-white/5 rounded-md pl-8 pr-3 py-1.5 text-xs text-white font-black focus:border-purple-500/50 outline-none transition-all"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>
        </div>
    );
}

function ShortcutButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex flex-col items-center justify-center gap-2 py-4 bg-neutral-800/40 hover:bg-neutral-800 border border-white/5 rounded-xl transition-all hover:scale-[1.02] active:scale-95 group shadow-sm hover:shadow-purple-500/10"
        >
            <div className="text-purple-500 group-hover:scale-110 transition-transform">{icon}</div>
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 group-hover:text-white transition-colors">{label}</span>
        </button>
    );
}

function MiniShortcutButton({ icon, onClick }: { icon: React.ReactNode; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center justify-center p-3 bg-neutral-800/40 hover:bg-neutral-800 border border-white/5 rounded-lg transition-all hover:scale-105 active:scale-95 group shadow-sm hover:border-purple-500/30"
        >
            <div className="text-neutral-500 group-hover:text-purple-400 transition-colors">{icon}</div>
        </button>
    );
}

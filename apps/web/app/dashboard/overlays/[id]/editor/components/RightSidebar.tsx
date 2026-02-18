'use client';

import React from 'react';
import { useEditor } from '../store';

export function RightSidebar() {
    const { state, dispatch } = useEditor();
    const selectedWidget = state.widgets.find(w => state.selectedWidgetIds.includes(w.id));

    if (!selectedWidget) {
        return (
            <div className="w-80 bg-neutral-900 border-l border-white/10 p-8 flex flex-col items-center justify-center text-center">
                <div className="text-neutral-600 mb-4">No Widget Selected</div>
                <p className="text-xs text-neutral-500">
                    Click on a widget in the canvas or layers panel to edit its properties.
                </p>
            </div>
        );
    }

    return (
        <div className="w-80 bg-neutral-900 border-l border-white/10 flex flex-col">
            <div className="p-4 border-b border-white/10">
                <h2 className="font-bold text-sm capitalize">{selectedWidget.type} Widget</h2>
                <p className="text-xs text-neutral-500 mt-1">ID: {selectedWidget.id.slice(0, 8)}</p>
            </div>

            <div className="p-4 space-y-6 overflow-y-auto flex-1">
                <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Position & Size</h3>

                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="X" value={selectedWidget.x} onChange={(val) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { x: Number(val) } } })} />
                        <InputGroup label="Y" value={selectedWidget.y} onChange={(val) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { y: Number(val) } } })} />
                        <InputGroup label="Width" value={selectedWidget.width} onChange={(val) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { width: Number(val) } } })} />
                        <InputGroup label="Height" value={selectedWidget.height} onChange={(val) => dispatch({ type: 'UPDATE_WIDGET', payload: { id: selectedWidget.id, updates: { height: Number(val) } } })} />
                    </div>
                </div>

                <div className="pt-4 border-t border-white/10">
                    <button
                        onClick={() => dispatch({ type: 'REMOVE_WIDGET', payload: selectedWidget.id })}
                        className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold rounded border border-red-500/20 transition-colors"
                    >
                        Delete Widget
                    </button>
                </div>
            </div>
        </div>
    );
}

function InputGroup({ label, value, onChange }: { label: string; value: number; onChange: (val: string) => void }) {
    return (
        <div>
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase font-bold">{label}</label>
            <input
                type="number"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-neutral-950 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
            />
        </div>
    );
}

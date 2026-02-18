'use client';

import React from 'react';
import { useEditor } from '../store';
import { Plus, Layers, Type, MessageSquare, Bell } from 'lucide-react';

export function LeftSidebar() {
    const { state, dispatch } = useEditor();

    const handleAddWidget = (type: string) => {
        dispatch({ type: 'ADD_WIDGET', payload: { type } });
    };

    return (
        <div className="w-64 bg-neutral-900 border-r border-white/10 flex flex-col">
            <div className="p-4 border-b border-white/10">
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4">Add Widget</h2>
                <div className="grid grid-cols-2 gap-2">
                    <WidgetButton icon={<MessageSquare size={16} />} label="Chat" onClick={() => handleAddWidget('chat')} />
                    <WidgetButton icon={<Bell size={16} />} label="Alert" onClick={() => handleAddWidget('alert')} />
                    <WidgetButton icon={<Type size={16} />} label="Text" onClick={() => handleAddWidget('text')} />
                    <WidgetButton icon={<Layers size={16} />} label="Image" onClick={() => handleAddWidget('image')} />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4">Layers</h2>
                <div className="space-y-1">
                    {state.widgets
                        .sort((a, b) => b.layer - a.layer) // Sort by layer (top first)
                        .map((widget) => (
                            <div
                                key={widget.id}
                                onClick={() => dispatch({ type: 'SELECT_WIDGET', payload: { id: widget.id, multi: false } })}
                                className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${state.selectedWidgetIds.includes(widget.id)
                                        ? 'bg-purple-600 text-white'
                                        : 'hover:bg-white/5 text-neutral-400 hover:text-white'
                                    }`}
                            >
                                <Layers size={14} />
                                <span className="text-sm font-medium capitalize">{widget.type}</span>
                            </div>
                        ))}
                    {state.widgets.length === 0 && (
                        <div className="text-xs text-neutral-600 text-center py-8">
                            No widgets added yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function WidgetButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex flex-col items-center justify-center gap-2 p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-all"
        >
            <div className="text-purple-400">{icon}</div>
            <span className="text-xs font-medium">{label}</span>
        </button>
    );
}

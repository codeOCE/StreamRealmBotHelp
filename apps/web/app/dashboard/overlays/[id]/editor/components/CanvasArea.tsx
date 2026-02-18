'use client';

import React, { useRef } from 'react';
import { useEditor, Widget } from '../store';
import { DndContext, useDraggable, DragEndEvent, DragStartEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';

const GRID_SIZE = 10;

export function CanvasArea() {
    const { state, dispatch } = useEditor();
    const canvasRef = useRef<HTMLDivElement>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // Prevent accidental drags when clicking
            },
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, delta } = event;
        const widgetId = active.id as string;
        const widget = state.widgets.find((w) => w.id === widgetId);

        if (widget) {
            // Apply grid snapping to the final position
            const newX = snapToGrid(widget.x + delta.x);
            const newY = snapToGrid(widget.y + delta.y);

            dispatch({
                type: 'UPDATE_WIDGET',
                payload: {
                    id: widgetId,
                    updates: { x: newX, y: newY },
                },
            });
        }
    };

    const handleDragStart = (event: DragStartEvent) => {
        const widgetId = event.active.id as string;
        if (!state.selectedWidgetIds.includes(widgetId)) {
            dispatch({ type: 'SELECT_WIDGET', payload: { id: widgetId, multi: false } });
        }
    };

    const handleBgClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            dispatch({ type: 'DESELECT_ALL' });
        }
    };

    // Calculate canvas size (placeholder for now, could be dynamic)
    const overlayWidth = state.overlay?.width || 1920;
    const overlayHeight = state.overlay?.height || 1080;
    const scale = state.scale || 0.5;

    return (
        <div
            className="flex-1 bg-neutral-950 overflow-auto flex items-center justify-center p-8 relative"
            onClick={handleBgClick}
        >
            {/* Grid Background */}
            <div
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
                    backgroundSize: `${20 * scale}px ${20 * scale}px`,
                    backgroundPosition: 'center'
                }}
            />

            <div
                className="relative bg-black shadow-2xl border border-white/5"
                style={{
                    width: overlayWidth,
                    height: overlayHeight,
                    transform: `scale(${scale})`, // Zoom level
                    transformOrigin: 'center center',
                }}
            >
                <DndContext
                    sensors={sensors}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToParentElement]}
                >
                    {state.widgets.map((widget) => (
                        <DraggableWidget key={widget.id} widget={widget} isSelected={state.selectedWidgetIds.includes(widget.id)} />
                    ))}
                </DndContext>
            </div>

            {/* Zoom Controls */}
            <div className="absolute bottom-6 right-6 flex bg-neutral-900 rounded-lg border border-white/10 p-1">
                <button onClick={() => dispatch({ type: 'SET_SCALE', payload: Math.max(0.1, state.scale - 0.1) })} className="px-3 py-1 hover:bg-white/10 text-white rounded">-</button>
                <div className="px-3 py-1 text-xs font-mono border-x border-white/10 flex items-center">{Math.round(state.scale * 100)}%</div>
                <button onClick={() => dispatch({ type: 'SET_SCALE', payload: Math.min(2, state.scale + 0.1) })} className="px-3 py-1 hover:bg-white/10 text-white rounded">+</button>
            </div>
        </div>
    );
}

function snapToGrid(value: number) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function DraggableWidget({ widget, isSelected }: { widget: Widget; isSelected: boolean }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: widget.id,
        data: widget,
    });

    const style: React.CSSProperties = {
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        left: widget.x,
        top: widget.y,
        width: widget.width,
        height: widget.height,
        position: 'absolute',
        zIndex: widget.layer,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={`cursor-move group ${isSelected ? 'ring-2 ring-purple-500 z-50' : 'hover:ring-1 hover:ring-white/30'}`}
        >
            <div className={`w-full h-full bg-neutral-800/80 border border-white/10 flex items-center justify-center overflow-hidden relative ${isSelected ? 'bg-neutral-800' : ''}`}>
                <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 opacity-50 group-hover:opacity-100 transition-opacity select-none pointer-events-none">
                    {widget.type}
                </span>

                {/* Resize Handles (Visual Only for Phase 1) */}
                {isSelected && (
                    <>
                        <div className="absolute top-0 left-0 w-2 h-2 bg-white border border-purple-500 -translate-x-1/2 -translate-y-1/2" />
                        <div className="absolute top-0 right-0 w-2 h-2 bg-white border border-purple-500 translate-x-1/2 -translate-y-1/2" />
                        <div className="absolute bottom-0 left-0 w-2 h-2 bg-white border border-purple-500 -translate-x-1/2 translate-y-1/2" />
                        <div className="absolute bottom-0 right-0 w-2 h-2 bg-white border border-purple-500 translate-x-1/2 translate-y-1/2" />
                    </>
                )}
            </div>
        </div>
    );
}

'use client';

import React, { useRef, useEffect } from 'react';
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
                distance: 5,
            },
        })
    );

    // Global Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            // Ignore inputs
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
                return;
            }

            // Delete / Backspace
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (state.selectedWidgetIds.length > 0) {
                    e.preventDefault();
                    state.selectedWidgetIds.forEach(id => {
                        dispatch({ type: 'REMOVE_WIDGET', payload: id });
                    });
                }
            }

            // Copy (Ctrl+C)
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                dispatch({ type: 'COPY' });
            }

            // Paste (Ctrl+V)
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                e.preventDefault();
                dispatch({ type: 'PASTE' });
            }

            // Undo (Ctrl+Z)
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                dispatch({ type: 'UNDO' });
            }

            // Redo (Ctrl+Y or Ctrl+Shift+Z)
            if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                dispatch({ type: 'REDO' });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state.selectedWidgetIds, dispatch]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, delta } = event;
        const widgetId = active.id as string;
        const widget = state.widgets.find((w) => w.id === widgetId);

        if (widget) {
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

    const overlayWidth = state.overlay?.width || 1920;
    const overlayHeight = state.overlay?.height || 1080;
    const scale = state.scale || 0.5;

    return (
        <div
            className="flex-1 bg-neutral-950 overflow-auto flex items-center justify-center p-8 relative"
            onClick={handleBgClick}
        >
            <div
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
                    backgroundSize: `${20 * scale}px ${20 * scale}px`,
                    backgroundPosition: 'center'
                }}
            />

            <div
                className="relative shadow-2xl"
                style={{
                    width: overlayWidth,
                    height: overlayHeight,
                    transform: `scale(${scale})`,
                    transformOrigin: 'center center',
                    backgroundColor: '#0a0a0a',
                    backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                }}
            >
                <DndContext
                    sensors={sensors}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToParentElement]}
                >
                    {state.widgets.map((widget) => (
                        <DraggableWidget
                            key={widget.id}
                            widget={widget}
                            isSelected={state.selectedWidgetIds.includes(widget.id)}
                            scale={scale} // Pass scale for resize calcs
                        />
                    ))}
                </DndContext>
            </div>

            <div className="absolute bottom-6 right-6 flex bg-[#09090b] rounded-md border border-[#27272a] shadow-lg">
                <button onClick={() => dispatch({ type: 'SET_SCALE', payload: Math.max(0.1, state.scale - 0.1) })} className="px-3 py-1.5 hover:bg-[#27272a] text-neutral-400 hover:text-white transition-colors">-</button>
                <div className="px-3 py-1.5 text-xs font-mono text-neutral-300 border-x border-[#27272a] flex items-center min-w-[60px] justify-center">
                    {Math.round(state.scale * 100)}%
                </div>
                <button onClick={() => dispatch({ type: 'SET_SCALE', payload: Math.min(2, state.scale + 0.1) })} className="px-3 py-1.5 hover:bg-[#27272a] text-neutral-400 hover:text-white transition-colors">+</button>
                <button className="px-3 py-1.5 hover:bg-[#27272a] text-neutral-400 hover:text-white transition-colors border-l border-[#27272a] text-xs font-medium">
                    Fit
                </button>
            </div>
        </div>
    );
}

function snapToGrid(value: number) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function DraggableWidget({ widget, isSelected, scale }: { widget: Widget; isSelected: boolean; scale: number }) {
    const { state, dispatch } = useEditor();
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

    // Explicit Click Handler for Selection
    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Stop bubbling to canvas background
        dispatch({
            type: 'SELECT_WIDGET',
            payload: {
                id: widget.id,
                multi: e.ctrlKey || e.metaKey, // Support multi-select
            },
        });
    };

    // Resize Logic
    const handleResizeStart = (e: React.PointerEvent, direction: string) => {
        e.stopPropagation(); // Prevent drag start
        e.preventDefault();

        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = widget.width;
        const startHeight = widget.height;
        const startLeft = widget.x;
        const startTop = widget.y;

        // Calculate initial aspect ratio
        const aspectRatio = startWidth / startHeight;

        const onPointerMove = (moveEvent: PointerEvent) => {
            const deltaX = (moveEvent.clientX - startX) / scale; // Adjust for zoom
            const deltaY = (moveEvent.clientY - startY) / scale;
            const isShiftDown = moveEvent.shiftKey;

            let newWidth = startWidth;
            let newHeight = startHeight;
            let newX = startLeft;
            let newY = startTop;

            // 1. Calculate unconstrained dimensions
            if (direction.includes('e')) newWidth = startWidth + deltaX;
            if (direction.includes('w')) {
                newWidth = startWidth - deltaX;
                newX = startLeft + deltaX;
            }
            if (direction.includes('s')) newHeight = startHeight + deltaY;
            if (direction.includes('n')) {
                newHeight = startHeight - deltaY;
                newY = startTop + deltaY;
            }

            // 2. Snap to grid or apply aspect ratio
            if (isShiftDown) {
                if (direction.length === 2 || direction === 'e' || direction === 'w') {
                    // Drive height by width
                    newWidth = snapToGrid(newWidth);
                    newHeight = newWidth / aspectRatio;
                } else if (direction === 'n' || direction === 's') {
                    // Drive width by height
                    newHeight = snapToGrid(newHeight);
                    newWidth = newHeight * aspectRatio;
                }

                if (direction.includes('w')) {
                    newX = startLeft + (startWidth - newWidth);
                }
                if (direction.includes('n')) {
                    newY = startTop + (startHeight - newHeight);
                }

            } else {
                if (direction.includes('e') || direction.includes('w')) newWidth = snapToGrid(newWidth);
                if (direction.includes('s') || direction.includes('n')) newHeight = snapToGrid(newHeight);
                if (direction.includes('w')) newX = snapToGrid(newX);
                if (direction.includes('n')) newY = snapToGrid(newY);
            }

            // Min size constraint
            if (newWidth < 20) newWidth = 20;
            if (newHeight < 20) newHeight = 20;

            dispatch({
                type: 'UPDATE_WIDGET',
                payload: {
                    id: widget.id,
                    updates: {
                        x: newX,
                        y: newY,
                        width: newWidth,
                        height: newHeight
                    }
                }
            });
        };

        const onPointerUp = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={handleClick}
            className={`cursor-move group ${isSelected ? 'ring-2 ring-purple-500 z-50' : 'hover:ring-1 hover:ring-white/30'}`}
        >
            <div className={`w-full h-full bg-neutral-800/80 border border-white/10 flex items-center justify-center overflow-hidden relative ${isSelected ? 'bg-neutral-800' : ''}`}>
                <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 opacity-50 group-hover:opacity-100 transition-opacity select-none pointer-events-none">
                    {widget.type}
                </span>

                {isSelected && (
                    <>
                        {/* Corners */}
                        <ResizeHandle direction="nw" onResizeStart={handleResizeStart} className="top-0 left-0 -translate-x-1/2 -translate-y-1/2" />
                        <ResizeHandle direction="ne" onResizeStart={handleResizeStart} className="top-0 right-0 translate-x-1/2 -translate-y-1/2" />
                        <ResizeHandle direction="sw" onResizeStart={handleResizeStart} className="bottom-0 left-0 -translate-x-1/2 translate-y-1/2" />
                        <ResizeHandle direction="se" onResizeStart={handleResizeStart} className="bottom-0 right-0 translate-x-1/2 translate-y-1/2" />

                        {/* Sides */}
                        <ResizeHandle direction="n" onResizeStart={handleResizeStart} className="top-0 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        <ResizeHandle direction="s" onResizeStart={handleResizeStart} className="bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" />
                        <ResizeHandle direction="w" onResizeStart={handleResizeStart} className="left-0 top-1/2 -translate-x-1/2 -translate-y-1/2" />
                        <ResizeHandle direction="e" onResizeStart={handleResizeStart} className="right-0 top-1/2 translate-x-1/2 -translate-y-1/2" />
                    </>
                )}
            </div>
        </div>
    );
}

function ResizeHandle({ direction, onResizeStart, className }: { direction: string; onResizeStart: (e: React.PointerEvent, dir: string) => void; className?: string }) {
    let cursor = 'cursor-move';
    if (direction === 'nw' || direction === 'se') cursor = 'cursor-nwse-resize';
    if (direction === 'ne' || direction === 'sw') cursor = 'cursor-nesw-resize';
    if (direction === 'n' || direction === 's') cursor = 'cursor-ns-resize';
    if (direction === 'e' || direction === 'w') cursor = 'cursor-ew-resize';

    return (
        <div
            onPointerDown={(e) => onResizeStart(e, direction)}
            className={`absolute w-2 h-2 bg-white border border-purple-500 z-50 ${cursor} ${className}`}
        />
    );
}

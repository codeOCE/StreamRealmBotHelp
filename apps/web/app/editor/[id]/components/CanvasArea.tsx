'use client';

import React, { useRef, useEffect, useState } from 'react';
import Moveable from 'react-moveable';
import Selecto from 'react-selecto';
import { useEditor, Widget } from '../store';
import { Copy, Scissors, Clipboard, Trash2, Layers, Settings, Group, MessageSquare, Bell, Image as ImageIcon, Type } from 'lucide-react';

const selectoStyles = `
.selecto-selection {
    background: rgba(168, 85, 247, 0.1) !important;
    border: 1px solid rgba(168, 85, 247, 0.5) !important;
    z-index: 100;
}
`;

export function CanvasArea() {
    const { state, dispatch } = useEditor();
    const { widgets, selectedWidgetIds, scale } = state;
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const workspaceRef = useRef<HTMLDivElement>(null);
    const moveableRef = useRef<Moveable>(null);
    const [targets, setTargets] = useState<(HTMLElement | SVGElement)[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
    const lastMousePos = useRef({ x: 500, y: 500 });
    const isPanning = useRef(false);
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    // Update Moveable targets when selection changes
    useEffect(() => {
        const selectedElements: (HTMLElement | SVGElement)[] = [];
        selectedWidgetIds.forEach(id => {
            const el = document.getElementById(`widget-${id}`);
            if (el) selectedElements.push(el);
        });
        setTargets(selectedElements);
    }, [selectedWidgetIds, widgets]);

    // Sync Moveable handles when state changes externally (Undo/Redo)
    useEffect(() => {
        if (moveableRef.current) {
            moveableRef.current.updateRect();
        }
    }, [widgets, scale]);

    // Handle background click to deselect
    const handleBackgroundClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('canvas-container')) {
            dispatch({ type: 'DESELECT_ALL' });
        }
    };

    // Auto-fit scale on mount
    useEffect(() => {
        const fit = () => {
            if (scrollContainerRef.current) {
                const container = scrollContainerRef.current;
                const availableWidth = container.clientWidth - 160;
                const availableHeight = container.clientHeight - 160;
                if (availableWidth > 0 && availableHeight > 0) {
                    const scaleX = availableWidth / 1920;
                    const scaleY = availableHeight / 1080;
                    const newScale = Math.min(scaleX, scaleY, 1);
                    dispatch({ type: 'SET_SCALE', payload: Math.floor(newScale * 100) / 100 });
                }
            }
        };
        fit();
        // Small delay to ensure container is fully sized
        const timer = setTimeout(fit, 100);
        return () => clearTimeout(timer);
    }, [dispatch]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (e.code === 'Space') {
                setIsSpacePressed(true);
                if (e.target === document.body) e.preventDefault();
            }

            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

            if (cmdOrCtrl && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) { dispatch({ type: 'REDO' }); } else { dispatch({ type: 'UNDO' }); }
            } else if (cmdOrCtrl && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                dispatch({ type: 'REDO' });
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                dispatch({ type: 'REMOVE_SELECTED_WIDGETS' });
            } else if (cmdOrCtrl && e.key.toLowerCase() === 'c') {
                dispatch({ type: 'COPY_SELECTED' });
            } else if (cmdOrCtrl && e.key.toLowerCase() === 'v') {
                if (workspaceRef.current) {
                    const rect = workspaceRef.current.getBoundingClientRect();
                    const x = (lastMousePos.current.x - rect.left) / scale;
                    const y = (lastMousePos.current.y - rect.top) / scale;
                    dispatch({ type: 'PASTE_CLIPBOARD', payload: { x, y } });
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') setIsSpacePressed(false);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [dispatch, scale]);

    // Zoom
    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.05 : 0.05;
                const newScale = Math.min(Math.max(scale + delta, 0.1), 3);
                dispatch({ type: 'SET_SCALE', payload: Math.round(newScale * 100) / 100 });
            }
        };
        const container = scrollContainerRef.current;
        if (container) container.addEventListener('wheel', handleWheel, { passive: false });
        return () => { if (container) container.removeEventListener('wheel', handleWheel); };
    }, [scale, dispatch]);

    return (
        <div
            ref={scrollContainerRef}
            className="flex-1 overflow-auto bg-neutral-900/50 relative selecto-container"
            style={{ cursor: isPanning.current ? 'grabbing' : isSpacePressed ? 'grab' : 'auto' }}
            onMouseMove={(e) => {
                lastMousePos.current = { x: e.clientX, y: e.clientY };
                if (isPanning.current && scrollContainerRef.current) {
                    scrollContainerRef.current.scrollLeft -= e.movementX;
                    scrollContainerRef.current.scrollTop -= e.movementY;
                }
            }}
            onMouseDown={(e) => {
                if (e.button === 1 || (isSpacePressed && e.button === 0)) {
                    isPanning.current = true;
                    e.preventDefault();
                    return;
                }
                handleBackgroundClick(e);
                if (contextMenu) setContextMenu(null);
            }}
            onMouseUp={() => { isPanning.current = false; }}
            onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY });
            }}
        >
            <style>{selectoStyles}</style>

            {/* Resolution Badge */}
            <div className="fixed top-24 left-80 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2 z-[100]">
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">1920 × 1080</span>
                <div className="w-px h-3 bg-white/10 mx-1" />
                <div className="flex items-center gap-1">
                    <button onClick={() => dispatch({ type: 'SET_SCALE', payload: Math.max(scale - 0.1, 0.1) })} className="w-5 h-5 flex items-center justify-center hover:bg-white/10 rounded">-</button>
                    <span className="text-[10px] font-black text-purple-400 min-w-[32px] text-center">{Math.round(scale * 100)}%</span>
                    <button onClick={() => dispatch({ type: 'SET_SCALE', payload: Math.min(scale + 0.1, 3) })} className="w-5 h-5 flex items-center justify-center hover:bg-white/10 rounded">+</button>
                </div>
            </div>

            {/* Center Wrapper */}
            <div className="canvas-container min-w-[4000px] min-h-[3000px] flex items-center justify-center relative">
                <div
                    ref={workspaceRef}
                    className="relative shadow-2xl bg-[#111111] selecto-area overflow-hidden"
                    style={{
                        width: 1920,
                        height: 1080,
                        transform: `scale(${scale})`,
                        transformOrigin: 'center center',
                        border: '1px solid rgba(168, 85, 247, 0.4)'
                    }}
                >
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '100px 100px' }} />

                    {/* Widgets Wrapper */}
                    <div className="absolute inset-0">
                        {widgets.map(widget => (
                            <div
                                key={widget.id}
                                id={`widget-${widget.id}`}
                                onMouseDown={(e) => {
                                    if (!selectedWidgetIds.includes(widget.id)) {
                                        dispatch({ type: 'SELECT_WIDGET', payload: { id: widget.id, multi: e.shiftKey } });
                                    }
                                    setTimeout(() => { if (moveableRef.current) moveableRef.current.dragStart(e.nativeEvent); }, 0);
                                }}
                                className={`absolute ${selectedWidgetIds.includes(widget.id) ? 'pointer-events-auto' : ''}`}
                                style={{
                                    left: 0, top: 0,
                                    transform: `translate(${widget.x}px, ${widget.y}px) rotate(${widget.rotation || 0}deg)`,
                                    width: widget.width, height: widget.height, zIndex: widget.layer, opacity: widget.isVisible ? 1 : 0,
                                    pointerEvents: widget.isVisible && !widget.isLocked ? 'auto' : 'none',
                                }}
                            >
                                {widget.isVisible && (
                                    <div
                                        className="w-full h-full relative group custom-drag-handler overflow-hidden"
                                        style={{
                                            color: widget.styles.color || '#ffffff',
                                            fontSize: widget.styles.fontSize || (widget.type === 'text' ? 24 : 14),
                                            fontWeight: widget.styles.fontWeight || 700,
                                            opacity: widget.styles.opacity ?? 1,
                                            backgroundColor: widget.styles.backgroundColor || (widget.type === 'text' ? 'transparent' : 'rgba(38, 38, 38, 0.8)'),
                                            border: `2px solid ${selectedWidgetIds.includes(widget.id) ? 'rgb(168 85 247)' : 'transparent'}`,
                                            borderRadius: widget.styles.borderRadius || 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            transition: 'border-color 0.2s',
                                        }}
                                    >
                                        {widget.type === 'text' && (
                                            <div className="w-full h-full whitespace-pre-wrap flex items-center justify-center text-center p-2">
                                                {widget.config.text || 'New Text Layer'}
                                            </div>
                                        )}

                                        {widget.type === 'chat' && (
                                            <div className="w-full h-full flex flex-col p-4 bg-black/40 backdrop-blur-sm">
                                                <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
                                                    <MessageSquare size={12} className="text-purple-400" />
                                                    <span className="text-[10px] uppercase font-black tracking-widest text-neutral-400">Twitch Chat</span>
                                                </div>
                                                <div className="flex-1 space-y-2 opacity-50">
                                                    <div className="h-2 w-3/4 bg-white/10 rounded" />
                                                    <div className="h-2 w-1/2 bg-white/10 rounded" />
                                                    <div className="h-2 w-2/3 bg-white/10 rounded" />
                                                </div>
                                            </div>
                                        )}

                                        {widget.type === 'alert' && (
                                            <div className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-purple-500/20 rounded-xl bg-purple-500/5">
                                                <Bell size={32} className="text-purple-500 mb-2 animate-bounce" />
                                                <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">Alert Box</span>
                                            </div>
                                        )}

                                        {widget.type === 'image' && (
                                            <div className="w-full h-full flex items-center justify-center bg-neutral-800">
                                                <ImageIcon size={32} className="text-neutral-600" />
                                            </div>
                                        )}

                                        {/* Hover Indicator */}
                                        <div className="absolute inset-0 border-2 border-purple-500/0 group-hover:border-purple-500/30 transition-colors pointer-events-none" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <Moveable
                        ref={moveableRef}
                        target={targets}
                        draggable={true} resizable={true} rotatable={true}
                        onDrag={({ target, transform, beforeTranslate }) => {
                            target.style.transform = transform;
                            dispatch({ type: 'UPDATE_WIDGET_LIVE', payload: { id: target.id.replace('widget-', ''), updates: { x: beforeTranslate[0], y: beforeTranslate[1] } } });
                        }}
                        onDragEnd={() => dispatch({ type: 'COMMIT_HISTORY' })}
                        onResize={({ target, width, height, drag }) => {
                            target.style.width = `${width}px`;
                            target.style.height = `${height}px`;
                            target.style.transform = drag.transform;
                            dispatch({ type: 'UPDATE_WIDGET_LIVE', payload: { id: target.id.replace('widget-', ''), updates: { width, height, x: drag.beforeTranslate[0], y: drag.beforeTranslate[1] } } });
                        }}
                        onResizeEnd={() => dispatch({ type: 'COMMIT_HISTORY' })}
                        onRotate={({ target, rotation, drag }) => {
                            target.style.transform = drag.transform;
                            dispatch({ type: 'UPDATE_WIDGET_LIVE', payload: { id: target.id.replace('widget-', ''), updates: { rotation } } });
                        }}
                        onRotateEnd={() => dispatch({ type: 'COMMIT_HISTORY' })}
                    />
                </div>
            </div>

            <Selecto
                dragContainer={scrollContainerRef.current}
                selectableTargets={[".selecto-area .absolute"]}
                hitRate={0} selectByClick={true} selectFromInside={false}
                onDragStart={e => {
                    const target = e.inputEvent.target;
                    if (isSpacePressed || target.closest('.moveable-control-box') || (targets.some(t => t.contains(target)) && !e.inputEvent.shiftKey)) {
                        e.stop();
                    }
                }}
                onSelect={e => {
                    const selectedIds = e.selected.map(el => el.id.replace('widget-', ''));
                    dispatch({ type: 'DESELECT_ALL' });
                    selectedIds.forEach(id => dispatch({ type: 'SELECT_WIDGET', payload: { id, multi: true } }));
                }}
            />

            {contextMenu && (
                <div
                    className="fixed z-[1000] w-56 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl p-1.5 backdrop-blur-xl"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onMouseDown={e => e.stopPropagation()}
                >
                    <ContextItem icon={<Copy size={14} />} label="Copy" shortcut="⌘C" onClick={() => { dispatch({ type: 'COPY_SELECTED' }); setContextMenu(null); }} />
                    <ContextItem icon={<Clipboard size={14} />} label="Paste" shortcut="⌘V" onClick={() => {
                        if (workspaceRef.current && contextMenu) {
                            const rect = workspaceRef.current.getBoundingClientRect();
                            const x = (contextMenu.x - rect.left) / scale;
                            const y = (contextMenu.y - rect.top) / scale;
                            dispatch({ type: 'PASTE_CLIPBOARD', payload: { x, y } });
                        }
                        setContextMenu(null);
                    }} />
                    <div className="h-px bg-white/5 my-1 mx-1" />
                    <ContextItem icon={<Trash2 size={14} />} label="Delete" shortcut="⌫" danger onClick={() => { dispatch({ type: 'REMOVE_SELECTED_WIDGETS' }); setContextMenu(null); }} />
                </div>
            )}
        </div>
    );
}

function ContextItem({ icon, label, shortcut, onClick, danger }: { icon: React.ReactNode, label: string, shortcut?: string, onClick: () => void, danger?: boolean }) {
    return (
        <button onClick={onClick} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${danger ? 'text-red-400 hover:bg-red-500/10' : 'text-neutral-300 hover:bg-white/5 hover:text-white'}`}>
            <div className="flex items-center gap-2">{icon}{label}</div>
            {shortcut && <span className="text-[10px] text-neutral-500 font-medium">{shortcut}</span>}
        </button>
    );
}

'use client';

import React, { useRef, useEffect, useState } from 'react';
import Selecto from 'react-selecto';
import { useEditor, Widget } from '../store';
import { buildAlertSrcDoc, EVENT_ICONS, eventListLabel } from '@/lib/alert-renderer';
import { ScaledAlertFrame } from '@/components/ScaledAlertFrame';
import { getAnimationStyle, animationReplayKey } from '@/lib/widget-animations';
import { isBundleWidget, getWidgetDefinition } from '@/lib/widgets/registry';
import { buildWidgetSrcDoc } from '@/lib/widgets/runtime';
import { computeSnap, SnapGuide } from '@/lib/editor/snap';
import { ChatList, getChatConfig, sampleChatMessages } from '@/lib/chat-config';
import {
    Copy, CopyPlus, Clipboard, Trash2, MessageSquare, Image as ImageIcon, Type,
    BringToFront, SendToBack, Lock,
    AlignStartVertical, AlignCenterVertical, AlignEndVertical,
    AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
} from 'lucide-react';

const selectoStyles = `
.selecto-selection {
    background: rgba(63, 170, 255, 0.08) !important;
    border: 1px solid rgba(63, 170, 255, 0.4) !important;
    z-index: 100;
}
`;

export function CanvasArea() {
    const { state, dispatch } = useEditor();
    const { widgets, selectedWidgetIds, scale } = state;
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const workspaceRef = useRef<HTMLDivElement>(null);
    const [targets, setTargets] = useState<(HTMLElement | SVGElement)[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
    const [guides, setGuides] = useState<SnapGuide[]>([]);
    const lastMousePos = useRef({ x: 500, y: 500 });
    const isPanning = useRef(false);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const nudgeCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Native pointer-drag state (replaces the Moveable programmatic-drag hack).
    const dragState = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        moved: boolean;
        items: { id: string; ox: number; oy: number; w: number; h: number }[];
    } | null>(null);

    useEffect(() => {
        const selectedElements: (HTMLElement | SVGElement)[] = [];
        widgets.forEach(w => {
            const el = document.getElementById(`widget-${w.id}`);
            if (!el) return;
            if (selectedWidgetIds.includes(w.id)) selectedElements.push(el);
        });
        setTargets(selectedElements);
    }, [selectedWidgetIds, widgets]);

    const handleBackgroundClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('canvas-container')) {
            dispatch({ type: 'DESELECT_ALL' });
        }
    };

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
        const timer = setTimeout(fit, 100);
        return () => clearTimeout(timer);
    }, [dispatch]);

    // Center the viewport on the overlay so it's visible immediately — the canvas
    // lives centered inside a much larger scroll area, which otherwise starts
    // scrolled to the empty top-left corner.
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const center = () => {
            el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
            el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
        };
        center();
        const t = setTimeout(center, 150); // after the fit/scale settles
        return () => clearTimeout(t);
    }, []);

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
            } else if (cmdOrCtrl && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                dispatch({ type: 'DUPLICATE_SELECTED' });
            } else if (cmdOrCtrl && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                dispatch({ type: 'DESELECT_ALL' });
                widgets.forEach(w => dispatch({ type: 'SELECT_WIDGET', payload: { id: w.id, multi: true } }));
            } else if (cmdOrCtrl && e.key === ']') {
                e.preventDefault();
                dispatch({ type: 'REORDER_Z', payload: e.shiftKey ? 'front' : 'forward' });
            } else if (cmdOrCtrl && e.key === '[') {
                e.preventDefault();
                dispatch({ type: 'REORDER_Z', payload: e.shiftKey ? 'back' : 'backward' });
            } else if (e.key.startsWith('Arrow')) {
                // Nudge: 1px, or 10px with Shift. Commit history once the burst settles.
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                dispatch({ type: 'NUDGE_SELECTED', payload: { dx, dy } });
                if (nudgeCommitTimer.current) clearTimeout(nudgeCommitTimer.current);
                nudgeCommitTimer.current = setTimeout(() => dispatch({ type: 'COMMIT_HISTORY' }), 400);
            } else if (e.key === 'Escape') {
                dispatch({ type: 'DESELECT_ALL' });
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpacePressed(false); };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
    }, [dispatch, scale, widgets]);

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
            className="flex-1 overflow-auto relative selecto-container"
            style={{
                background: '#030507',
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                cursor: isPanning.current ? 'grabbing' : isSpacePressed ? 'grab' : 'auto'
            }}
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
            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
        >
            <style>{selectoStyles}</style>

            {/* Canvas badge */}
            <div className="fixed top-[4.5rem] left-[18.5rem] bg-[#0a0c10]/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/8 flex items-center gap-2 z-[100]">
                <div className="w-1.5 h-1.5 bg-brand-primary rounded-full" />
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">1920 × 1080</span>
                <div className="w-px h-3 bg-white/10 mx-0.5" />
                <div className="flex items-center gap-0.5">
                    <button
                        onClick={() => dispatch({ type: 'SET_SCALE', payload: Math.max(scale - 0.1, 0.1) })}
                        className="w-5 h-5 flex items-center justify-center hover:bg-white/8 rounded text-zinc-500 hover:text-white transition-colors cursor-pointer text-sm"
                        aria-label="Zoom out"
                    >−</button>
                    <span className="text-[9px] font-black text-brand-primary min-w-[30px] text-center tabular-nums">{Math.round(scale * 100)}%</span>
                    <button
                        onClick={() => dispatch({ type: 'SET_SCALE', payload: Math.min(scale + 0.1, 3) })}
                        className="w-5 h-5 flex items-center justify-center hover:bg-white/8 rounded text-zinc-500 hover:text-white transition-colors cursor-pointer text-sm"
                        aria-label="Zoom in"
                    >+</button>
                </div>
            </div>

            {/* Scroll center */}
            <div className="canvas-container min-w-[4000px] min-h-[3000px] flex items-center justify-center relative">
                <div
                    ref={workspaceRef}
                    className="relative shadow-2xl selecto-area overflow-hidden"
                    style={{
                        width: 1920, height: 1080,
                        transform: `scale(${scale})`,
                        transformOrigin: 'center center',
                        background: '#111214',
                        border: '1px solid rgba(63, 170, 255, 0.2)',
                        boxShadow: '0 0 0 1px rgba(63,170,255,0.05), 0 32px 80px rgba(0,0,0,0.8)',
                    }}
                >
                    {/* Grid on canvas */}
                    <div
                        className="absolute inset-0 opacity-[0.04] pointer-events-none"
                        style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '100px 100px' }}
                    />

                    {/* Widgets */}
                    <div className="absolute inset-0">
                        {widgets.map(widget => (
                            <div
                                key={widget.id}
                                id={`widget-${widget.id}`}
                                onPointerDown={(e) => {
                                    if (e.button !== 0 || isSpacePressed) return; // left-button only; space = pan
                                    const alreadySelected = selectedWidgetIds.includes(widget.id);
                                    if (!alreadySelected) {
                                        dispatch({ type: 'SELECT_WIDGET', payload: { id: widget.id, multi: e.shiftKey } });
                                    }
                                    if (widget.isLocked) return;
                                    // Move all selected widgets together; if grabbing an unselected one, just it.
                                    const moveIds = alreadySelected && selectedWidgetIds.length ? selectedWidgetIds : [widget.id];
                                    const items = moveIds
                                        .map(id => widgets.find(w => w.id === id))
                                        .filter((w): w is Widget => !!w && !w.isLocked)
                                        .map(w => ({ id: w.id, ox: w.x, oy: w.y, w: w.width, h: w.height }));
                                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                                    dragState.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, items };
                                    e.stopPropagation();
                                }}
                                onPointerMove={(e) => {
                                    const ds = dragState.current;
                                    if (!ds || ds.pointerId !== e.pointerId) return;
                                    let dx = (e.clientX - ds.startX) / scale;
                                    let dy = (e.clientY - ds.startY) / scale;
                                    if (!ds.moved && Math.abs(e.clientX - ds.startX) < 3 && Math.abs(e.clientY - ds.startY) < 3) return;
                                    ds.moved = true;
                                    // Snap the group's bounding box to canvas + other widgets (hold Alt to disable).
                                    const movingIds = new Set(ds.items.map(i => i.id));
                                    const bx0 = Math.min(...ds.items.map(i => i.ox));
                                    const by0 = Math.min(...ds.items.map(i => i.oy));
                                    const bw = Math.max(...ds.items.map(i => i.ox + i.w)) - bx0;
                                    const bh = Math.max(...ds.items.map(i => i.oy + i.h)) - by0;
                                    if (!e.altKey) {
                                        const statics = widgets
                                            .filter(w => !movingIds.has(w.id) && w.isVisible)
                                            .map(w => ({ x: w.x, y: w.y, w: w.width, h: w.height }));
                                        const snap = computeSnap({ x: bx0 + dx, y: by0 + dy, w: bw, h: bh }, statics, 1920, 1080, 6 / scale);
                                        dx += snap.dx; dy += snap.dy;
                                        setGuides(snap.guides);
                                    } else {
                                        setGuides([]);
                                    }
                                    for (const it of ds.items) {
                                        const nx = Math.min(Math.max(it.ox + dx, 0), 1920 - it.w);
                                        const ny = Math.min(Math.max(it.oy + dy, 0), 1080 - it.h);
                                        dispatch({ type: 'UPDATE_WIDGET_LIVE', payload: { id: it.id, updates: { x: nx, y: ny } } });
                                    }
                                }}
                                onPointerUp={(e) => {
                                    const ds = dragState.current;
                                    if (!ds || ds.pointerId !== e.pointerId) return;
                                    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
                                    dragState.current = null;
                                    setGuides([]);
                                    if (ds.moved) dispatch({ type: 'COMMIT_HISTORY' });
                                }}
                                className={`absolute ${selectedWidgetIds.includes(widget.id) ? 'pointer-events-auto' : ''}`}
                                style={{
                                    left: 0, top: 0,
                                    transform: `translate(${widget.x}px, ${widget.y}px) rotate(${widget.rotation || 0}deg)`,
                                    width: widget.width, height: widget.height, zIndex: widget.layer,
                                    opacity: widget.isVisible ? 1 : 0,
                                    pointerEvents: widget.isVisible && !widget.isLocked ? 'auto' : 'none',
                                }}
                            >
                                {widget.isVisible && (
                                    <div
                                        className="w-full h-full relative group custom-drag-handler overflow-hidden"
                                        style={{
                                            color: widget.styles.color || '#ffffff',
                                            fontSize: widget.styles.fontSize || (widget.type === 'text' ? 24 : (widget.type === 'label' ? 20 : 14)),
                                            fontWeight: widget.styles.fontWeight || 700,
                                            opacity: widget.styles.opacity ?? 1,
                                            backgroundColor: widget.type === 'chat' ? 'transparent' : (widget.styles.backgroundColor || (widget.type === 'text' || widget.type === 'alert' || isBundleWidget(widget.type) ? 'transparent' : 'rgba(20, 22, 28, 0.8)')),
                                            border: `2px solid ${selectedWidgetIds.includes(widget.id) ? '#3faaff' : 'transparent'}`,
                                            borderRadius: widget.styles.borderRadius || 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'border-color 0.15s',
                                            fontFamily: widget.styles.fontFamily ? `'${widget.styles.fontFamily}', sans-serif` : 'inherit',
                                        }}
                                    >
                                      <div
                                        className="w-full h-full flex items-center justify-center"
                                        style={getAnimationStyle(widget.config.animation)}
                                        key={animationReplayKey(widget.config.animation)}
                                      >
                                        {isBundleWidget(widget.type) && (() => {
                                            const def = getWidgetDefinition(widget.type);
                                            if (!def?.bundle) return null;
                                            // previewLoop makes the bundle self-animate in the editor (no real events).
                                            // A transparent shield sits above the iframe so it never captures the
                                            // pointer during a drag — without it, dragging over the iframe breaks
                                            // Moveable's tracking and the widget flies off-canvas.
                                            return (
                                                <div className="relative w-full h-full">
                                                    <iframe
                                                        key={JSON.stringify(widget.config)}
                                                        srcDoc={buildWidgetSrcDoc(def, { ...widget.config, previewLoop: true })}
                                                        sandbox="allow-scripts"
                                                        className="absolute inset-0 w-full h-full border-0 pointer-events-none"
                                                        style={{ background: 'transparent' }}
                                                        title={`${def.name} preview`}
                                                    />
                                                    <div className="absolute inset-0" style={{ cursor: 'inherit' }} />
                                                </div>
                                            );
                                        })()}

                                        {widget.type === 'text' && (
                                            <div className="w-full h-full whitespace-pre-wrap flex items-center justify-center text-center p-2">
                                                {widget.config.text || 'New Text Layer'}
                                            </div>
                                        )}

                                        {widget.type === 'label' && (
                                            <div className="w-full h-full flex flex-col items-center justify-center p-2">
                                                <div className="text-[10px] font-black uppercase tracking-tighter opacity-40 mb-1">{widget.config.labelTitle || 'Recent Follower'}</div>
                                                <div className="text-xl font-black truncate w-full text-center">{widget.config.value || 'Waiting…'}</div>
                                            </div>
                                        )}

                                        {widget.type === 'chat' && (
                                            <ChatList
                                                messages={state.messages.length ? state.messages : sampleChatMessages(getChatConfig(widget.config).platforms)}
                                                config={widget.config}
                                                styles={widget.styles}
                                            />
                                        )}

                                        {widget.type === 'alert' && (
                                            <div className="relative w-full h-full">
                                                <ScaledAlertFrame
                                                    frameKey={state.activeAlert ? JSON.stringify(state.activeAlert) : 'preview'}
                                                    srcDoc={buildAlertSrcDoc(
                                                        widget.config,
                                                        state.activeAlert ?? { type: 'follow', username: 'PreviewUser', message: '' }
                                                    )}
                                                    widgetWidth={widget.width}
                                                    widgetHeight={widget.height}
                                                    title="Alert preview"
                                                />
                                                {/* Shield so the iframe can't capture the pointer mid-drag. */}
                                                <div className="absolute inset-0" style={{ cursor: 'inherit' }} />
                                            </div>
                                        )}

                                        {widget.type === 'goal' && (
                                            <div className="w-full h-full p-4 flex flex-col justify-center gap-2">
                                                <div className="flex justify-between items-end mb-1">
                                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{widget.config.title || 'Follower Goal'}</span>
                                                    <span className="text-xs font-black">
                                                        {state.goalData[widget.config.goalType || 'follows'] || widget.config.current || 0} / {widget.config.target || 100}
                                                    </span>
                                                </div>
                                                <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden border border-white/5">
                                                    <div
                                                        className="h-full rounded-full shadow-[0_0_12px_rgba(63,170,255,0.4)] transition-[width] duration-1000"
                                                        style={{
                                                            width: `${Math.min(100, ((state.goalData[widget.config.goalType || 'follows'] || widget.config.current || 0) / (widget.config.target || 100)) * 100)}%`,
                                                            backgroundColor: widget.styles.barColor || '#3faaff'
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {widget.type === 'image' && (
                                            widget.config.src ? (
                                                <img
                                                    src={widget.config.src}
                                                    alt=""
                                                    draggable={false}
                                                    className="w-full h-full pointer-events-none select-none"
                                                    style={{ objectFit: widget.styles.objectFit || 'cover', borderRadius: widget.styles.borderRadius || 0 }}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-white/[0.02] border border-white/5">
                                                    <ImageIcon size={28} className="text-zinc-700" />
                                                </div>
                                            )
                                        )}

                                        {widget.type === 'eventlist' && (
                                            <div className="w-full h-full flex flex-col gap-1.5 p-3 overflow-hidden text-left">
                                                <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-0.5">{widget.config.title || 'Recent Events'}</div>
                                                {[{ type: 'follow', username: 'NewFan' }, { type: 'subscribe', username: 'LoyalViewer' }, { type: 'cheer', username: 'BitLord', amount: 500 }].slice(0, widget.config.max ?? 5).map((e, i) => (
                                                    <div key={i} className="flex items-center gap-2 text-xs">
                                                        <span className="shrink-0">{EVENT_ICONS[e.type]}</span>
                                                        <span className="font-bold truncate">{e.username}</span>
                                                        <span className="opacity-50 truncate">{eventListLabel(e)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                      </div>

                                        {/* Hover name tag */}
                                        <div className="absolute -top-6 left-0 right-0 flex justify-center pointer-events-none">
                                            <div className="bg-brand-primary/80 backdrop-blur-md px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity border border-brand-primary/40 shadow-lg">
                                                {widget.config.name || widget.type}
                                            </div>
                                        </div>

                                        {/* Hover border hint */}
                                        <div className="absolute inset-0 border border-brand-primary/0 group-hover:border-brand-primary/20 transition-colors pointer-events-none rounded-[inherit]" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Google Fonts preloader */}
                    <div className="hidden">
                        {Array.from(new Set(widgets.map(w => w.styles.fontFamily).filter(Boolean))).map(font => (
                            <link key={font} rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${font?.replace(/\s+/g, '+')}:wght@400;700;900&display=swap`} />
                        ))}
                    </div>

                    {/* Snap guide lines (canvas coords; kept ~1px on screen). */}
                    {guides.map((g, i) => (
                        <div
                            key={i}
                            className="absolute pointer-events-none"
                            style={g.axis === 'x'
                                ? { left: g.pos, top: 0, width: 1 / scale, height: 1080, background: '#ff4d6d', zIndex: 9998 }
                                : { top: g.pos, left: 0, height: 1 / scale, width: 1920, background: '#ff4d6d', zIndex: 9998 }}
                        />
                    ))}

                    {/* Selection box + resize handles — plain pointer-driven, the way
                        design tools do it. Single = direct resize/rotate; multi = scale
                        the whole group from a shared bounding box. */}
                    {(() => {
                        const sel = widgets.filter(w => selectedWidgetIds.includes(w.id) && w.isVisible && !w.isLocked);
                        return sel.length >= 1
                            ? <SelectionOverlay selected={sel} scale={scale} dispatch={dispatch} onGuides={setGuides} />
                            : null;
                    })()}
                </div>
            </div>

            <Selecto
                dragContainer={scrollContainerRef.current}
                selectableTargets={[".selecto-area .absolute"]}
                hitRate={0} selectByClick selectFromInside={false}
                onDragStart={e => {
                    const target = e.inputEvent.target;
                    if (isSpacePressed || target.closest('[data-resize-handle]') || (targets.some(t => t.contains(target)) && !e.inputEvent.shiftKey)) {
                        e.stop();
                    }
                }}
                onSelect={e => {
                    const selectedIds = e.selected.map(el => el.id.replace('widget-', ''));
                    dispatch({ type: 'DESELECT_ALL' });
                    selectedIds.forEach(id => dispatch({ type: 'SELECT_WIDGET', payload: { id, multi: true } }));
                }}
            />

            {contextMenu && (() => {
                const hasSelection = selectedWidgetIds.length > 0;
                const close = () => setContextMenu(null);
                return (
                <div
                    className="fixed z-[1000] w-56 bg-[#0a0c10] border border-white/8 rounded-xl shadow-2xl p-1.5 backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onMouseDown={e => e.stopPropagation()}
                >
                    {hasSelection && (
                        <ContextItem icon={<CopyPlus size={13} />} label="Duplicate" shortcut="⌘D" onClick={() => { dispatch({ type: 'DUPLICATE_SELECTED' }); close(); }} />
                    )}
                    <ContextItem icon={<Copy size={13} />} label="Copy" shortcut="⌘C" onClick={() => { dispatch({ type: 'COPY_SELECTED' }); close(); }} />
                    <ContextItem icon={<Clipboard size={13} />} label="Paste" shortcut="⌘V" onClick={() => {
                        if (workspaceRef.current && contextMenu) {
                            const rect = workspaceRef.current.getBoundingClientRect();
                            dispatch({ type: 'PASTE_CLIPBOARD', payload: { x: (contextMenu.x - rect.left) / scale, y: (contextMenu.y - rect.top) / scale } });
                        }
                        close();
                    }} />

                    {hasSelection && <>
                        <div className="h-px bg-white/5 my-1 mx-1" />
                        <ContextItem icon={<BringToFront size={13} />} label="Bring to front" shortcut="⌘⇧]" onClick={() => { dispatch({ type: 'REORDER_Z', payload: 'front' }); close(); }} />
                        <ContextItem icon={<SendToBack size={13} />} label="Send to back" shortcut="⌘⇧[" onClick={() => { dispatch({ type: 'REORDER_Z', payload: 'back' }); close(); }} />

                        <div className="h-px bg-white/5 my-1 mx-1" />
                        <div className="px-2 py-1 flex items-center justify-between">
                            {([
                                ['left', AlignStartVertical], ['hcenter', AlignCenterVertical], ['right', AlignEndVertical],
                                ['top', AlignStartHorizontal], ['vcenter', AlignCenterHorizontal], ['bottom', AlignEndHorizontal],
                            ] as const).map(([dir, Icon]) => (
                                <button
                                    key={dir}
                                    onClick={() => { dispatch({ type: 'ALIGN_SELECTED', payload: dir }); close(); }}
                                    title={`Align ${dir}`}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
                                >
                                    <Icon size={13} />
                                </button>
                            ))}
                        </div>

                        <div className="h-px bg-white/5 my-1 mx-1" />
                        <ContextItem icon={<Lock size={13} />} label="Lock / unlock" onClick={() => { dispatch({ type: 'TOGGLE_SELECTED_LOCK' }); close(); }} />
                        <ContextItem icon={<Trash2 size={13} />} label="Delete" shortcut="⌫" danger onClick={() => { dispatch({ type: 'REMOVE_SELECTED_WIDGETS' }); close(); }} />
                    </>}
                </div>
                );
            })()}
        </div>
    );
}

function ContextItem({ icon, label, shortcut, onClick, danger }: { icon: React.ReactNode; label: string; shortcut?: string; onClick: () => void; danger?: boolean }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors duration-100 cursor-pointer ${
                danger ? 'text-rose-400 hover:bg-rose-500/10' : 'text-zinc-300 hover:bg-white/5 hover:text-white'
            }`}
        >
            <div className="flex items-center gap-2">{icon}{label}</div>
            {shortcut && <span className="text-[10px] text-zinc-600 font-medium">{shortcut}</span>}
        </button>
    );
}

// Traditional selection box with 8 resize handles, driven by raw pointer events.
// new size = original size + (pointerDelta / canvasScale); origin-moving handles
// (n/w) adjust x/y too. Clamped to a minimum and to the 1920x1080 canvas.
const HANDLES: { dir: string; fx: number; fy: number; cursor: string }[] = [
    { dir: 'nw', fx: 0,   fy: 0,   cursor: 'nwse-resize' },
    { dir: 'n',  fx: 0.5, fy: 0,   cursor: 'ns-resize' },
    { dir: 'ne', fx: 1,   fy: 0,   cursor: 'nesw-resize' },
    { dir: 'e',  fx: 1,   fy: 0.5, cursor: 'ew-resize' },
    { dir: 'se', fx: 1,   fy: 1,   cursor: 'nwse-resize' },
    { dir: 's',  fx: 0.5, fy: 1,   cursor: 'ns-resize' },
    { dir: 'sw', fx: 0,   fy: 1,   cursor: 'nesw-resize' },
    { dir: 'w',  fx: 0,   fy: 0.5, cursor: 'ew-resize' },
];

function SelectionOverlay({ selected, scale, dispatch, onGuides }: {
    selected: Widget[];
    scale: number;
    dispatch: (action: any) => void;
    onGuides: (g: SnapGuide[]) => void;
}) {
    const MIN = 20;
    const boxRef = useRef<HTMLDivElement>(null);
    const single = selected.length === 1 ? selected[0] : null;

    // Live bounding box of the selection (tracks as children resize).
    // ponytail: ignores child rotation for the group box — fine for axis-aligned layouts.
    const bx = Math.min(...selected.map(w => w.x));
    const by = Math.min(...selected.map(w => w.y));
    const bw = Math.max(...selected.map(w => w.x + w.width)) - bx;
    const bh = Math.max(...selected.map(w => w.y + w.height)) - by;

    const drag = useRef<null | {
        pointerId: number; mode: 'resize' | 'rotate'; dir: string;
        sx: number; sy: number;
        b0: { x: number; y: number; w: number; h: number };
        children: { id: string; x: number; y: number; w: number; h: number }[];
        cx: number; cy: number; a0: number; rot0: number;
    }>(null);

    const startResize = (dir: string) => (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onGuides([]);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = {
            pointerId: e.pointerId, mode: 'resize', dir, sx: e.clientX, sy: e.clientY,
            b0: { x: bx, y: by, w: bw, h: bh },
            children: selected.map(w => ({ id: w.id, x: w.x, y: w.y, w: w.width, h: w.height })),
            cx: 0, cy: 0, a0: 0, rot0: 0,
        };
    };

    const startRotate = (e: React.PointerEvent) => {
        if (e.button !== 0 || !single || !boxRef.current) return;
        e.stopPropagation();
        onGuides([]);
        const rect = boxRef.current.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = {
            pointerId: e.pointerId, mode: 'rotate', dir: '', sx: e.clientX, sy: e.clientY,
            b0: { x: bx, y: by, w: bw, h: bh }, children: [],
            cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), rot0: single.rotation || 0,
        };
    };

    const onMove = (e: React.PointerEvent) => {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;

        if (d.mode === 'rotate' && single) {
            const a = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
            let deg = d.rot0 + (a - d.a0) * 180 / Math.PI;
            if (e.shiftKey) deg = Math.round(deg / 15) * 15; // 15° steps with Shift
            dispatch({ type: 'UPDATE_WIDGET_LIVE', payload: { id: single.id, updates: { rotation: Math.round(deg) } } });
            return;
        }

        // ponytail: resize math is screen-delta / scale; resizing a rotated widget is
        // approximate. Add rotation-aware handles only if users actually resize rotated layers.
        const dx = (e.clientX - d.sx) / scale;
        const dy = (e.clientY - d.sy) / scale;
        let { x, y, w, h } = d.b0;
        if (d.dir.includes('e')) w = Math.max(d.b0.w + dx, MIN);
        if (d.dir.includes('s')) h = Math.max(d.b0.h + dy, MIN);
        if (d.dir.includes('w')) { x = Math.min(d.b0.x + dx, d.b0.x + d.b0.w - MIN); w = d.b0.x + d.b0.w - x; }
        if (d.dir.includes('n')) { y = Math.min(d.b0.y + dy, d.b0.y + d.b0.h - MIN); h = d.b0.y + d.b0.h - y; }
        // Scale every child proportionally within the new box (no-op offsets for a single widget).
        const fx = w / d.b0.w, fy = h / d.b0.h;
        for (const c of d.children) {
            dispatch({ type: 'UPDATE_WIDGET_LIVE', payload: { id: c.id, updates: {
                x: x + (c.x - d.b0.x) * fx,
                y: y + (c.y - d.b0.y) * fy,
                width: Math.max(c.w * fx, 1),
                height: Math.max(c.h * fy, 1),
            } } });
        }
    };

    const onUp = (e: React.PointerEvent) => {
        if (!drag.current || drag.current.pointerId !== e.pointerId) return;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
        drag.current = null;
        dispatch({ type: 'COMMIT_HISTORY' });
    };

    const hs = 11 / scale;       // handle box, constant size on screen
    const border = 1.5 / scale;  // outline, constant on screen
    const rotGap = 22 / scale;   // rotation handle distance above the box

    return (
        <div
            ref={boxRef}
            className="absolute pointer-events-none"
            style={{
                left: bx, top: by, width: bw, height: bh,
                transform: single ? `rotate(${single.rotation || 0}deg)` : undefined,
                outline: `${border}px solid #3faaff`,
                zIndex: 9999,
            }}
        >
            {/* Rotation handle — single selection only. */}
            {single && (
                <>
                    <div className="absolute bg-brand-primary" style={{ left: '50%', top: -rotGap, width: border, height: rotGap, transform: 'translateX(-50%)' }} />
                    <div
                        data-resize-handle
                        onPointerDown={startRotate}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        className="absolute pointer-events-auto bg-white rounded-full"
                        style={{
                            width: hs, height: hs,
                            left: `calc(50% - ${hs / 2}px)`,
                            top: -rotGap - hs / 2,
                            border: `${border}px solid #3faaff`,
                            cursor: 'grab', touchAction: 'none',
                        }}
                    />
                </>
            )}
            {HANDLES.map(({ dir, fx, fy, cursor }) => (
                <div
                    key={dir}
                    data-resize-handle
                    onPointerDown={startResize(dir)}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    className="absolute pointer-events-auto bg-white rounded-sm"
                    style={{
                        width: hs, height: hs,
                        left: `calc(${fx * 100}% - ${hs / 2}px)`,
                        top: `calc(${fy * 100}% - ${hs / 2}px)`,
                        border: `${border}px solid #3faaff`,
                        cursor,
                        touchAction: 'none',
                    }}
                />
            ))}
        </div>
    );
}

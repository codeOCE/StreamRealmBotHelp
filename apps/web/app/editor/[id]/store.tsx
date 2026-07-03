'use client';

import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { nanoid } from 'nanoid';

// Types
export interface Widget {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    config: Record<string, any>;
    styles: Record<string, any>;
    layer: number; // Higher is on top
    isVisible: boolean;
    isLocked: boolean;
}

export interface OverlayData {
    id: string;
    name: string;
    width: number;
    height: number;
}

interface EditorState {
    overlay: OverlayData | null;
    widgets: Widget[];
    selectedWidgetIds: string[];
    history: Widget[][]; // Array of widget states for undo/redo
    historyIndex: number;
    scale: number;
    clipboard: Widget[];
    messages: any[]; // Real-time chat messages
    activeAlert: any | null; // Currently showing alert
    goalData: Record<string, number>; // Current progress for goals (e.g., { follows: 50, subs: 10 })
}

// Actions
type Action =
    | { type: 'SET_OVERLAY'; payload: OverlayData }
    | { type: 'SET_WIDGETS'; payload: Widget[] }
    | { type: 'ADD_WIDGET'; payload: { type: string; baseConfig?: any; width?: number; height?: number } }
    | { type: 'UPDATE_WIDGET'; payload: { id: string; updates: Partial<Widget> } }
    | { type: 'UPDATE_WIDGET_LIVE'; payload: { id: string; updates: Partial<Widget> } }
    | { type: 'UPDATE_WIDGET_CONFIG'; payload: { id: string; config: Record<string, any> } }
    | { type: 'UPDATE_WIDGET_STYLE'; payload: { id: string; styles: Record<string, any> } }
    | { type: 'REMOVE_WIDGET'; payload: string }
    | { type: 'REMOVE_SELECTED_WIDGETS' }
    | { type: 'SELECT_WIDGET'; payload: { id: string; multi: boolean } }
    | { type: 'DESELECT_ALL' }
    | { type: 'UNDO' }
    | { type: 'REDO' }
    | { type: 'COMMIT_HISTORY' }
    | { type: 'SET_SCALE'; payload: number }
    | { type: 'COPY_SELECTED' }
    | { type: 'PASTE_CLIPBOARD'; payload: { x: number, y: number } }
    | { type: 'DUPLICATE_SELECTED' }
    | { type: 'NUDGE_SELECTED'; payload: { dx: number; dy: number } }
    | { type: 'REORDER_Z'; payload: 'front' | 'back' | 'forward' | 'backward' }
    | { type: 'ALIGN_SELECTED'; payload: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' }
    | { type: 'DISTRIBUTE_SELECTED'; payload: 'horizontal' | 'vertical' }
    | { type: 'REORDER_LAYERS'; payload: string[] } // ids in displayed order (front → back)
    | { type: 'TOGGLE_SELECTED_LOCK' }
    | { type: 'TOGGLE_SELECTED_VISIBILITY' }
    | { type: 'RECONCILE_WIDGET_IDS'; payload: { from: string; to: string }[] }
    | { type: 'ADD_CHAT_MESSAGE'; payload: any }
    | { type: 'SET_ACTIVE_ALERT'; payload: any | null }
    | { type: 'UPDATE_GOAL_DATA'; payload: { type: string; value: number } };

// Context
const EditorContext = createContext<{
    state: EditorState;
    dispatch: React.Dispatch<Action>;
} | null>(null);

// Initial State
const initialState: EditorState = {
    overlay: null,
    widgets: [],
    selectedWidgetIds: [],
    history: [[]],
    historyIndex: 0,
    scale: 1,
    clipboard: [],
    messages: [],
    activeAlert: null,
    goalData: {},
};

// Reducer
function editorReducer(state: EditorState, action: Action): EditorState {
    switch (action.type) {
        case 'SET_OVERLAY':
            return { ...state, overlay: action.payload };

        case 'SET_WIDGETS':
            return {
                ...state,
                widgets: action.payload,
                history: [action.payload],
                historyIndex: 0,
            };

        case 'ADD_WIDGET': {
            const newWidget: Widget = {
                id: nanoid(),
                type: action.payload.type,
                x: 100,
                y: 100,
                width: action.payload.width ?? 300,
                height: action.payload.height ?? 200,
                rotation: 0,
                config: action.payload.baseConfig || {},
                styles: {},
                layer: state.widgets.length + 1,
                isVisible: true,
                isLocked: false,
            };
            const newWidgets = [...state.widgets, newWidget];
            return recordHistory({ ...state, widgets: newWidgets });
        }

        case 'UPDATE_WIDGET': {
            const newWidgets = state.widgets.map((w) =>
                w.id === action.payload.id ? { ...w, ...action.payload.updates } : w
            );
            return recordHistory({ ...state, widgets: newWidgets });
        }

        case 'UPDATE_WIDGET_LIVE': {
            const newWidgets = state.widgets.map((w) =>
                w.id === action.payload.id ? { ...w, ...action.payload.updates } : w
            );
            return { ...state, widgets: newWidgets };
        }

        case 'UPDATE_WIDGET_CONFIG': {
            const newWidgets = state.widgets.map((w) =>
                w.id === action.payload.id ? { ...w, config: { ...w.config, ...action.payload.config } } : w
            );
            return recordHistory({ ...state, widgets: newWidgets });
        }

        case 'UPDATE_WIDGET_STYLE': {
            const newWidgets = state.widgets.map((w) =>
                w.id === action.payload.id ? { ...w, styles: { ...w.styles, ...action.payload.styles } } : w
            );
            return recordHistory({ ...state, widgets: newWidgets });
        }

        case 'REMOVE_WIDGET': {
            const newWidgets = state.widgets.filter((w) => w.id !== action.payload);
            return recordHistory({
                ...state,
                widgets: newWidgets,
                selectedWidgetIds: state.selectedWidgetIds.filter((id) => id !== action.payload),
            });
        }

        case 'REMOVE_SELECTED_WIDGETS': {
            if (state.selectedWidgetIds.length === 0) return state;
            const newWidgets = state.widgets.filter((w) => !state.selectedWidgetIds.includes(w.id));
            return recordHistory({
                ...state,
                widgets: newWidgets,
                selectedWidgetIds: [],
            });
        }

        case 'SELECT_WIDGET': {
            const { id, multi } = action.payload;
            if (multi) {
                const isSelected = state.selectedWidgetIds.includes(id);
                return {
                    ...state,
                    selectedWidgetIds: isSelected
                        ? state.selectedWidgetIds.filter((wid) => wid !== id)
                        : [...state.selectedWidgetIds, id],
                };
            }
            return {
                ...state,
                selectedWidgetIds: [id],
            };
        }

        case 'DESELECT_ALL':
            return { ...state, selectedWidgetIds: [] };

        case 'UNDO': {
            if (state.historyIndex <= 0) return state;
            const newIndex = state.historyIndex - 1;
            return {
                ...state,
                historyIndex: newIndex,
                widgets: state.history[newIndex],
            };
        }

        case 'REDO': {
            if (state.historyIndex >= state.history.length - 1) return state;
            const newIndex = state.historyIndex + 1;
            return {
                ...state,
                historyIndex: newIndex,
                widgets: state.history[newIndex],
            };
        }

        case 'COMMIT_HISTORY':
            return recordHistory(state);

        case 'SET_SCALE':
            return { ...state, scale: action.payload };

        case 'COPY_SELECTED': {
            const selectedWidgets = state.widgets.filter(w => state.selectedWidgetIds.includes(w.id));
            return { ...state, clipboard: JSON.parse(JSON.stringify(selectedWidgets)) };
        }

        case 'PASTE_CLIPBOARD': {
            if (state.clipboard.length === 0) return state;

            // Calculate offset if needed, or use mouse position
            const newWidgets = state.clipboard.map((w, idx) => ({
                ...w,
                id: nanoid(),
                x: action.payload.x + (idx * 20), // Slight offset for stack visibility
                y: action.payload.y + (idx * 20),
                layer: state.widgets.length + idx + 1
            }));

            const finalWidgets = [...state.widgets, ...newWidgets];
            return recordHistory({
                ...state,
                widgets: finalWidgets,
                selectedWidgetIds: newWidgets.map(w => w.id)
            });
        }

        case 'DUPLICATE_SELECTED': {
            const selected = state.widgets.filter(w => state.selectedWidgetIds.includes(w.id));
            if (selected.length === 0) return state;
            const clones = JSON.parse(JSON.stringify(selected)).map((w: Widget, i: number) => ({
                ...w,
                id: nanoid(),
                x: w.x + 24,
                y: w.y + 24,
                layer: state.widgets.length + i + 1,
            }));
            return recordHistory({
                ...state,
                widgets: [...state.widgets, ...clones],
                selectedWidgetIds: clones.map((w: Widget) => w.id),
            });
        }

        case 'NUDGE_SELECTED': {
            // Live move (no history) — caller commits once after the burst settles.
            const { dx, dy } = action.payload;
            const ids = new Set(state.selectedWidgetIds);
            const newWidgets = state.widgets.map(w =>
                ids.has(w.id) && !w.isLocked ? { ...w, x: w.x + dx, y: w.y + dy } : w
            );
            return { ...state, widgets: newWidgets };
        }

        case 'REORDER_Z': {
            if (state.selectedWidgetIds.length === 0) return state;
            return recordHistory({
                ...state,
                widgets: reorderZ(state.widgets, state.selectedWidgetIds, action.payload),
            });
        }

        case 'ALIGN_SELECTED': {
            return recordHistory({
                ...state,
                widgets: alignWidgets(
                    state.widgets,
                    state.selectedWidgetIds,
                    action.payload,
                    state.overlay?.width ?? 1920,
                    state.overlay?.height ?? 1080,
                ),
            });
        }

        case 'DISTRIBUTE_SELECTED': {
            return recordHistory({
                ...state,
                widgets: distributeWidgets(state.widgets, state.selectedWidgetIds, action.payload),
            });
        }

        case 'REORDER_LAYERS': {
            // payload is the displayed order (front → back); top of the list = highest layer.
            const order = action.payload;
            const layerOf = new Map(order.map((id, i) => [id, order.length - i]));
            return recordHistory({
                ...state,
                widgets: state.widgets.map(w => layerOf.has(w.id) ? { ...w, layer: layerOf.get(w.id)! } : w),
            });
        }

        case 'TOGGLE_SELECTED_LOCK': {
            const ids = new Set(state.selectedWidgetIds);
            if (ids.size === 0) return state;
            const anyUnlocked = state.widgets.some(w => ids.has(w.id) && !w.isLocked);
            return recordHistory({
                ...state,
                widgets: state.widgets.map(w => ids.has(w.id) ? { ...w, isLocked: anyUnlocked } : w),
            });
        }

        case 'TOGGLE_SELECTED_VISIBILITY': {
            const ids = new Set(state.selectedWidgetIds);
            if (ids.size === 0) return state;
            const anyVisible = state.widgets.some(w => ids.has(w.id) && w.isVisible);
            return recordHistory({
                ...state,
                widgets: state.widgets.map(w => ids.has(w.id) ? { ...w, isVisible: !anyVisible } : w),
            });
        }

        case 'RECONCILE_WIDGET_IDS': {
            // After a save, swap client temp ids for the server-assigned ids so the
            // next save updates rather than re-creates. No history change — this is a
            // bookkeeping swap, not a user edit.
            // ponytail: only reconciles current widgets, not history snapshots; an
            // undo past a save then re-save can re-create a widget. Map across history
            // if that edge case ever bites.
            const map = new Map(action.payload.map(({ from, to }) => [from, to]));
            return {
                ...state,
                widgets: state.widgets.map(w => map.has(w.id) ? { ...w, id: map.get(w.id)! } : w),
                selectedWidgetIds: state.selectedWidgetIds.map(id => map.get(id) ?? id),
            };
        }

        case 'ADD_CHAT_MESSAGE':
            return {
                ...state,
                messages: [...state.messages.slice(-10), action.payload]
            };

        case 'SET_ACTIVE_ALERT':
            return {
                ...state,
                activeAlert: action.payload
            };

        case 'UPDATE_GOAL_DATA':
            return {
                ...state,
                goalData: {
                    ...state.goalData,
                    [action.payload.type]: action.payload.value
                }
            };

        default:
            return state;
    }
}

// Reassign widget `layer` values so the selected widgets move in z-order.
function reorderZ(widgets: Widget[], selectedIds: string[], mode: 'front' | 'back' | 'forward' | 'backward'): Widget[] {
    const ids = new Set(selectedIds);
    // Current back→front order by layer.
    let order = [...widgets].sort((a, b) => a.layer - b.layer).map(w => w.id);
    if (mode === 'front') {
        order = [...order.filter(id => !ids.has(id)), ...order.filter(id => ids.has(id))];
    } else if (mode === 'back') {
        order = [...order.filter(id => ids.has(id)), ...order.filter(id => !ids.has(id))];
    } else if (mode === 'forward') {
        for (let i = order.length - 2; i >= 0; i--) {
            if (ids.has(order[i]) && !ids.has(order[i + 1])) [order[i], order[i + 1]] = [order[i + 1], order[i]];
        }
    } else {
        for (let i = 1; i < order.length; i++) {
            if (ids.has(order[i]) && !ids.has(order[i - 1])) [order[i], order[i - 1]] = [order[i - 1], order[i]];
        }
    }
    const layerOf = new Map(order.map((id, i) => [id, i + 1]));
    return widgets.map(w => ({ ...w, layer: layerOf.get(w.id) ?? w.layer }));
}

// Align selected widgets. With one selected, align to the canvas; with several,
// align within their combined bounding box (Figma/Canva behaviour).
function alignWidgets(
    widgets: Widget[],
    selectedIds: string[],
    dir: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom',
    canvasW: number,
    canvasH: number,
): Widget[] {
    const sel = widgets.filter(w => selectedIds.includes(w.id) && !w.isLocked);
    if (sel.length === 0) return widgets;
    const single = sel.length === 1;
    const minX = single ? 0 : Math.min(...sel.map(w => w.x));
    const minY = single ? 0 : Math.min(...sel.map(w => w.y));
    const maxX = single ? canvasW : Math.max(...sel.map(w => w.x + w.width));
    const maxY = single ? canvasH : Math.max(...sel.map(w => w.y + w.height));
    const ids = new Set(sel.map(w => w.id));
    return widgets.map(w => {
        if (!ids.has(w.id)) return w;
        switch (dir) {
            case 'left':    return { ...w, x: minX };
            case 'right':   return { ...w, x: maxX - w.width };
            case 'hcenter': return { ...w, x: (minX + maxX) / 2 - w.width / 2 };
            case 'top':     return { ...w, y: minY };
            case 'bottom':  return { ...w, y: maxY - w.height };
            case 'vcenter': return { ...w, y: (minY + maxY) / 2 - w.height / 2 };
        }
    });
}

// Distribute 3+ selected widgets so the gaps between them are equal, keeping the
// first and last in place (Figma/Canva "distribute spacing").
export function distributeWidgets(
    widgets: Widget[],
    selectedIds: string[],
    dir: 'horizontal' | 'vertical',
): Widget[] {
    const sel = widgets.filter(w => selectedIds.includes(w.id) && !w.isLocked);
    if (sel.length < 3) return widgets;
    const horiz = dir === 'horizontal';
    const start = (w: Widget) => (horiz ? w.x : w.y);
    const size = (w: Widget) => (horiz ? w.width : w.height);
    const sorted = [...sel].sort((a, b) => start(a) - start(b));
    const first = sorted[0], last = sorted[sorted.length - 1];
    const span = start(last) - (start(first) + size(first));
    const totalInner = sorted.slice(1, -1).reduce((s, w) => s + size(w), 0);
    const gap = (span - totalInner) / (sorted.length - 1);

    const newStart = new Map<string, number>();
    let cursor = start(first) + size(first) + gap;
    for (let i = 1; i < sorted.length - 1; i++) {
        newStart.set(sorted[i].id, cursor);
        cursor += size(sorted[i]) + gap;
    }
    return widgets.map(w =>
        newStart.has(w.id) ? { ...w, [horiz ? 'x' : 'y']: newStart.get(w.id)! } : w
    );
}

// Helper to record history
function recordHistory(state: EditorState): EditorState {
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(state.widgets);

    // Limit history stack size if needed (e.g., 50)
    if (newHistory.length > 50) newHistory.shift();

    return {
        ...state,
        history: newHistory,
        historyIndex: newHistory.length - 1,
    };
}

// Provider Component
export function EditorProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(editorReducer, initialState);

    return (
        <EditorContext.Provider value={{ state, dispatch }}>
            {children}
        </EditorContext.Provider>
    );
}

// Custom Hook
export function useEditor() {
    const context = useContext(EditorContext);
    if (!context) {
        throw new Error('useEditor must be used within an EditorProvider');
    }
    return context;
}

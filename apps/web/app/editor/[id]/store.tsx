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
}

// Actions
type Action =
    | { type: 'SET_OVERLAY'; payload: OverlayData }
    | { type: 'SET_WIDGETS'; payload: Widget[] }
    | { type: 'ADD_WIDGET'; payload: { type: string; baseConfig?: any } }
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
    | { type: 'PASTE_CLIPBOARD'; payload: { x: number, y: number } };

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
                width: 300,
                height: 200,
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

        default:
            return state;
    }
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

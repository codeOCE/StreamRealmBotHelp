'use client';

import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Types
export interface Widget {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    config: Record<string, any>;
    styles: Record<string, any>;
    layer: number; // Higher is on top
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
    | { type: 'REMOVE_WIDGET'; payload: string }
    | { type: 'SELECT_WIDGET'; payload: { id: string; multi: boolean } }
    | { type: 'DESELECT_ALL' }
    | { type: 'UNDO' }
    | { type: 'REDO' }
    | { type: 'SET_SCALE'; payload: number }
    | { type: 'COPY' }
    | { type: 'PASTE' };

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
                id: uuidv4(),
                type: action.payload.type,
                x: 100,
                y: 100,
                width: 300,
                height: 200,
                config: action.payload.baseConfig || {},
                styles: {},
                layer: state.widgets.length + 1,
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

        case 'REMOVE_WIDGET': {
            const newWidgets = state.widgets.filter((w) => w.id !== action.payload);
            return recordHistory({
                ...state,
                widgets: newWidgets,
                selectedWidgetIds: state.selectedWidgetIds.filter((id) => id !== action.payload),
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

        case 'SET_SCALE':
            return { ...state, scale: action.payload };

        case 'COPY': {
            const selectedWidgets = state.widgets.filter(w => state.selectedWidgetIds.includes(w.id));
            if (selectedWidgets.length === 0) return state;
            return { ...state, clipboard: selectedWidgets };
        }

        case 'PASTE': {
            if (state.clipboard.length === 0) return state;

            const newWidgets = state.clipboard.map(w => ({
                ...w,
                id: uuidv4(),
                x: w.x + 20,
                y: w.y + 20,
                layer: state.widgets.length + 1
            }));

            const updatedWidgets = [...state.widgets, ...newWidgets];

            return recordHistory({
                ...state,
                widgets: updatedWidgets,
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

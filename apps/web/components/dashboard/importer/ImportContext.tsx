"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ImportState {
    step: 'connect' | 'select' | 'migrating' | 'complete';
    provider: 'streamelements' | 'nightbot' | 'manual' | null;
    items: any[];
    selectedItems: Set<string>;
    logs: string[];
}

interface ImportContextType {
    state: ImportState;
    setStep: (step: ImportState['step']) => void;
    setProvider: (provider: ImportState['provider']) => void;
    setItems: (items: any[]) => void;
    toggleItem: (id: string) => void;
    setSelectedItems: (ids: Set<string>) => void;
    addLog: (log: string) => void;
    reset: () => void;
    onComplete?: (items: any[]) => void;
}

const ImportContext = createContext<ImportContextType | undefined>(undefined);

/**
 * Provides a context for the import flow and supplies state plus updater helpers to descendant components.
 *
 * @param children - React nodes to render within the provider
 * @param onComplete - Optional callback that will be invoked with the imported items when the import completes
 * @returns A JSX element that wraps children with the ImportContext provider containing state and mutation functions
 */
export function ImportProvider({ children, onComplete }: { children: ReactNode, onComplete?: (items: any[]) => void }) {
    const [state, setState] = useState<ImportState>({
        step: 'connect',
        provider: null,
        items: [],
        selectedItems: new Set(),
        logs: [],
    });

    const setStep = (step: ImportState['step']) => setState(prev => ({ ...prev, step }));
    const setProvider = (provider: ImportState['provider']) => setState(prev => ({ ...prev, provider }));
    const setItems = (items: any[]) => setState(prev => ({ ...prev, items }));

    const toggleItem = (id: string) => {
        setState(prev => {
            const next = new Set(prev.selectedItems);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return { ...prev, selectedItems: next };
        });
    };

    const setSelectedItems = (ids: Set<string>) => setState(prev => ({ ...prev, selectedItems: ids }));

    const addLog = (log: string) => setState(prev => ({ ...prev, logs: [...prev.logs, log] }));

    const reset = () => setState({
        step: 'connect',
        provider: null,
        items: [],
        selectedItems: new Set(),
        logs: [],
    });

    return (
        <ImportContext.Provider value={{ state, setStep, setProvider, setItems, toggleItem, setSelectedItems, addLog, reset, onComplete }}>
            {children}
        </ImportContext.Provider>
    );
}

export const useImport = () => {
    const context = useContext(ImportContext);
    if (!context) throw new Error("useImport must be used within ImportProvider");
    return context;
};
"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type ImportDataType = 'commands' | 'timers' | 'points';

interface ImportState {
    step: 'connect' | 'select' | 'migrating' | 'complete';
    provider: 'streamelements' | 'nightbot' | 'manual' | null;
    dataType: ImportDataType;
    items: any[];
    selectedItems: Set<string>;
    logs: string[];
}

interface ImportContextType {
    state: ImportState;
    setStep: (step: ImportState['step']) => void;
    setProvider: (provider: ImportState['provider']) => void;
    setDataType: (dataType: ImportDataType) => void;
    setItems: (items: any[]) => void;
    toggleItem: (id: string) => void;
    setSelectedItems: (ids: Set<string>) => void;
    addLog: (log: string) => void;
    reset: () => void;
    onComplete?: (items: any[], dataType: ImportDataType) => void;
}

const ImportContext = createContext<ImportContextType | undefined>(undefined);

export function ImportProvider({ children, onComplete }: { children: ReactNode, onComplete?: (items: any[], dataType: ImportDataType) => void }) {
    const [state, setState] = useState<ImportState>({
        step: 'connect',
        provider: null,
        dataType: 'commands',
        items: [],
        selectedItems: new Set(),
        logs: [],
    });

    const setStep = (step: ImportState['step']) => setState(prev => ({ ...prev, step }));
    const setProvider = (provider: ImportState['provider']) => setState(prev => ({ ...prev, provider }));
    const setDataType = (dataType: ImportDataType) => setState(prev => ({ ...prev, dataType }));
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
        dataType: 'commands',
        items: [],
        selectedItems: new Set(),
        logs: [],
    });

    return (
        <ImportContext.Provider value={{ state, setStep, setProvider, setDataType, setItems, toggleItem, setSelectedItems, addLog, reset, onComplete }}>
            {children}
        </ImportContext.Provider>
    );
}

export const useImport = () => {
    const context = useContext(ImportContext);
    if (!context) throw new Error("useImport must be used within ImportProvider");
    return context;
};

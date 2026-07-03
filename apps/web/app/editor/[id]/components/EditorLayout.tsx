'use client';

import React from 'react';
import { LeftSidebar } from './LeftSidebar';
import { TopToolbar } from './TopToolbar';
import { CanvasArea } from './CanvasArea';
import { ShortcutsHelp } from './ShortcutsHelp';

export function EditorLayout() {
    return (
        <div className="flex flex-col h-screen bg-[#05070a] text-white overflow-hidden font-sans">
            <TopToolbar />
            <div className="flex-1 flex overflow-hidden">
                <LeftSidebar />
                <CanvasArea />
            </div>
            <ShortcutsHelp />
        </div>
    );
}

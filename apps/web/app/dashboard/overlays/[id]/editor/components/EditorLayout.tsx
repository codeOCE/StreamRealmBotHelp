'use client';

import React from 'react';
import { EditorProvider } from '../store';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { TopToolbar } from './TopToolbar';
import { CanvasArea } from './CanvasArea';

export function EditorLayout() {
    return (
        <EditorProvider>
            <div className="flex flex-col h-screen bg-neutral-950 text-white overflow-hidden">
                <TopToolbar />
                <div className="flex-1 flex overflow-hidden">
                    <LeftSidebar />
                    <CanvasArea />
                    <RightSidebar />
                </div>
            </div>
        </EditorProvider>
    );
}

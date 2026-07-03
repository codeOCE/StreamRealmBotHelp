'use client';

import React, { useEffect, useRef, useState } from 'react';

/** Size alert presets are authored at (the alert widget's default). */
export const ALERT_BASE_WIDTH = 560;
export const ALERT_BASE_HEIGHT = 320;

/**
 * Sandboxed alert iframe whose CONTENT scales with the widget box. Preset
 * HTML/CSS uses fixed px sizes authored for 560x320, so rendering the iframe
 * at the widget's raw size just centers a small alert in empty space. Instead
 * the content renders at its logical size and is uniformly scaled (no
 * distortion) to fill the box: double the widget, double the alert.
 *
 * `widgetWidth/Height` are the widget's canvas dimensions; the element itself
 * fills its parent and measures it, so previews rendered smaller than the
 * widget (e.g. the alert editor's side panel) stay faithful automatically.
 */
export function ScaledAlertFrame({
    srcDoc,
    widgetWidth,
    widgetHeight,
    frameKey,
    title = 'Alert',
}: {
    srcDoc: string;
    widgetWidth: number;
    widgetHeight: number;
    frameKey?: React.Key;
    title?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState<{ w: number; h: number } | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const ww = Math.max(1, widgetWidth);
    const wh = Math.max(1, widgetHeight);
    const bw = box?.w || ww;
    const bh = box?.h || wh;
    // Content scale at widget size, then adjusted for how the box is rendered
    // (box == widget on the live overlay/canvas; smaller in the editor preview).
    const contentScale = Math.min(ww / ALERT_BASE_WIDTH, wh / ALERT_BASE_HEIGHT);
    const scale = Math.max(0.02, contentScale * (bw / ww));

    return (
        <div ref={ref} className="relative w-full h-full overflow-hidden">
            <iframe
                key={frameKey}
                srcDoc={srcDoc}
                sandbox="allow-scripts"
                title={title}
                className="absolute left-0 top-0 border-0 pointer-events-none"
                style={{
                    width: bw / scale,
                    height: bh / scale,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    background: 'transparent',
                }}
            />
        </div>
    );
}

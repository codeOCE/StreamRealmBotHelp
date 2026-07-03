// Snapping for the overlay editor: snap a moving bounding box to the canvas
// edges/centre and to other widgets' edges/centres, returning the delta to apply
// plus the guide lines that matched (so the canvas can draw them).

export interface SnapRect { x: number; y: number; w: number; h: number }
export interface SnapGuide { axis: 'x' | 'y'; pos: number }
export interface SnapResult { dx: number; dy: number; guides: SnapGuide[] }

export function computeSnap(
    box: SnapRect,
    statics: SnapRect[],
    canvasW: number,
    canvasH: number,
    threshold: number,
): SnapResult {
    const vLines = [0, canvasW / 2, canvasW];
    const hLines = [0, canvasH / 2, canvasH];
    for (const s of statics) {
        vLines.push(s.x, s.x + s.w / 2, s.x + s.w);
        hLines.push(s.y, s.y + s.h / 2, s.y + s.h);
    }

    // Nearest line to any of the box's three edges (start / centre / end) on one axis.
    const best = (movers: number[], lines: number[]) => {
        let bd = threshold + 1, line: number | null = null, delta = 0;
        for (const m of movers) for (const l of lines) {
            const d = Math.abs(m - l);
            if (d < bd) { bd = d; line = l; delta = l - m; }
        }
        return line === null ? null : { line, delta };
    };

    const vx = best([box.x, box.x + box.w / 2, box.x + box.w], vLines);
    const hy = best([box.y, box.y + box.h / 2, box.y + box.h], hLines);

    const guides: SnapGuide[] = [];
    if (vx) guides.push({ axis: 'x', pos: vx.line });
    if (hy) guides.push({ axis: 'y', pos: hy.line });
    return { dx: vx?.delta ?? 0, dy: hy?.delta ?? 0, guides };
}

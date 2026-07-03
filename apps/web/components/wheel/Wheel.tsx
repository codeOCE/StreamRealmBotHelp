'use client';

export interface WheelSegment {
  label: string;
  /** Drives both odds and visual slice size; defaults to 1. */
  weight?: number;
  color?: string;
  image?: string;
}

export type PointerStyle = 'arrow' | 'triangle' | 'pin';

export interface WheelStyle {
  strokeWidth?: number;
  strokeColor?: string;
  pointer?: {
    angle?: number; // degrees clockwise from top
    type?: 'default' | 'image';
    color?: string;
    style?: PointerStyle;
    imageUrl?: string | null;
  };
  centerImage?: { enabled?: boolean; url?: string | null };
}

/** Full per-wheel config as returned by the API (mirrors the worker's WheelConfig). */
export interface WheelConfig {
  size: WheelSizeBucket;
  spinSpeed: 1 | 2 | 3 | 4;
  strokeWidth: number;
  strokeColor: string;
  removeOnSelect: boolean;
  pointer: { angle: number; type: 'default' | 'image'; color: string; style: PointerStyle; imageUrl: string | null };
  centerImage: { enabled: boolean; url: string | null };
  announce: {
    enabled: boolean;
    chat: boolean;
    sound: { enabled: boolean; url: string | null };
    spinSound: { enabled: boolean; url: string | null };
  };
}

export const DEFAULT_WHEEL_CONFIG: WheelConfig = {
  size: 'md',
  spinSpeed: 2,
  strokeWidth: 2,
  strokeColor: 'rgba(0,0,0,0.25)',
  removeOnSelect: false,
  pointer: { angle: 0, type: 'default', color: '#ffffff', style: 'arrow', imageUrl: null },
  centerImage: { enabled: false, url: null },
  announce: { enabled: true, chat: false, sound: { enabled: false, url: null }, spinSound: { enabled: false, url: null } },
};

/** Project a WheelConfig onto the render-only WheelStyle the component consumes. */
export function styleFromConfig(c: WheelConfig): WheelStyle {
  return {
    strokeWidth: c.strokeWidth,
    strokeColor: c.strokeColor,
    pointer: c.pointer,
    centerImage: c.centerImage,
  };
}

export const PALETTE = ['#a855f7', '#06b6d4', '#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#ec4899', '#14b8a6'];

export type WheelSizeBucket = 'sm' | 'md' | 'lg' | 'xl';

/** Pixel diameter for each overlay size bucket. */
export function wheelSizePx(size: WheelSizeBucket | undefined): number {
  return ({ sm: 300, md: 400, lg: 500, xl: 620 } as Record<string, number>)[size ?? 'md'] ?? 400;
}

/** Animation duration (seconds) for a spin-speed setting (1 slow … 4 fast). */
export function spinDuration(speed: number | undefined): number {
  return ({ 1: 6, 2: 4.5, 3: 3.2, 4: 2.2 } as Record<number, number>)[speed ?? 2] ?? 4.5;
}

/** Extra full turns before settling for a spin-speed setting. */
export function spinExtraTurns(speed: number | undefined): number {
  return ({ 1: 3, 2: 5, 3: 7, 4: 9 } as Record<number, number>)[speed ?? 2] ?? 5;
}

export function segmentColor(seg: WheelSegment, i: number): string {
  return seg.color || PALETTE[i % PALETTE.length];
}

function effWeight(s: WheelSegment): number {
  return Math.max(0, s.weight ?? 1);
}

export interface Arc {
  start: number;
  mid: number;
  end: number;
  sweep: number;
}

/** Lay segments around the wheel proportional to weight (deg clockwise from top). */
export function segmentArcs(segments: WheelSegment[]): Arc[] {
  const n = segments.length;
  if (n === 0) return [];
  let weights = segments.map(effWeight);
  let total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    weights = segments.map(() => 1);
    total = n;
  }
  const arcs: Arc[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const sweep = (weights[i] / total) * 360;
    arcs.push({ start: cursor, end: cursor + sweep, sweep, mid: cursor + sweep / 2 });
    cursor += sweep;
  }
  return arcs;
}

/**
 * Next absolute rotation (deg) so wheel-local angle `targetDeg` lands under a
 * pointer fixed at `pointerAngle` deg clockwise from the top, spinning forward
 * through `extraSpins` full turns. Always >= current.
 */
export function spinToAngle(current: number, targetDeg: number, pointerAngle = 0, extraSpins = 5): number {
  const targetWithin = (((pointerAngle - targetDeg) % 360) + 360) % 360;
  const currentMod = ((current % 360) + 360) % 360;
  const delta = ((targetWithin - currentMod + 360) % 360) + extraSpins * 360;
  return current + delta;
}

/** Polar (angle clockwise from top) -> SVG coords. */
function point(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

function Pointer({ style, color, kind, imageUrl, size }: {
  style: PointerStyle;
  color: string;
  kind: 'default' | 'image';
  imageUrl?: string | null;
  size: number;
}) {
  const w = Math.max(20, size * 0.08);
  if (kind === 'image' && imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        style={{ width: w * 1.6, height: w * 1.6, objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
      />
    );
  }
  const shadow = 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))';
  if (style === 'pin') {
    return (
      <svg width={w} height={w * 1.4} viewBox="0 0 24 34" style={{ filter: shadow }}>
        <path d="M12 34 C4 22 2 16 2 11 a10 10 0 0 1 20 0 c0 5-2 11-10 23Z" fill={color} />
        <circle cx="12" cy="11" r="4" fill="rgba(0,0,0,0.35)" />
      </svg>
    );
  }
  if (style === 'triangle') {
    return (
      <svg width={w * 1.4} height={w} viewBox="0 0 34 24" style={{ filter: shadow }}>
        <path d="M17 24 L2 2 L32 2 Z" fill={color} />
      </svg>
    );
  }
  // arrow (default): slim downward arrow
  return (
    <svg width={w} height={w * 1.3} viewBox="0 0 24 32" style={{ filter: shadow }}>
      <path d="M12 32 L3 12 L9 12 L9 2 L15 2 L15 12 L21 12 Z" fill={color} />
    </svg>
  );
}

export default function Wheel({
  segments,
  rotation = 0,
  size = 360,
  spinning = false,
  durationSec = 4.5,
  style = {},
}: {
  segments: WheelSegment[];
  rotation?: number;
  size?: number;
  spinning?: boolean;
  durationSec?: number;
  style?: WheelStyle;
}) {
  const n = segments.length;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const arcs = segmentArcs(segments);

  const strokeWidth = style.strokeWidth ?? 2;
  const strokeColor = style.strokeColor ?? 'rgba(0,0,0,0.25)';
  const pointerAngle = style.pointer?.angle ?? 0;
  const centerOn = style.centerImage?.enabled && style.centerImage?.url;
  const hubR = size * 0.06;

  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      {/* Pointer — rotated around the wheel center to sit at pointer.angle. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `rotate(${pointerAngle}deg)`,
          transformOrigin: 'center',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        <div style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', display: 'flex' }}>
          <Pointer
            kind={style.pointer?.type ?? 'default'}
            style={style.pointer?.style ?? 'arrow'}
            color={style.pointer?.color ?? '#ffffff'}
            imageUrl={style.pointer?.imageUrl}
            size={size}
          />
        </div>
      </div>

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          {arcs.map((_, i) => (
            <clipPath id={`wedge-${i}`} key={i}>
              <path d={wedgePath(cx, cy, r, arcs[i].start, arcs[i].end)} />
            </clipPath>
          ))}
        </defs>
        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center',
            transition: spinning ? `transform ${durationSec}s cubic-bezier(0.17, 0.67, 0.12, 0.99)` : 'none',
          }}
        >
          {n === 0 ? (
            <circle cx={cx} cy={cy} r={r} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" />
          ) : (
            segments.map((s, i) => {
              const { start, end, sweep, mid } = arcs[i];
              if (sweep <= 0) return null;
              const labelAngle = mid;
              const flip = labelAngle > 90 && labelAngle < 270;
              const lp = point(cx, cy, r * 0.62, mid);
              const fontSize = Math.max(9, Math.min(16, (size / 24) * (sweep / (360 / Math.max(n, 1)))));
              return (
                <g key={i}>
                  <path
                    d={wedgePath(cx, cy, r, start, end)}
                    fill={segmentColor(s, i)}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                  />
                  {s.image ? (
                    <image
                      href={s.image}
                      x={lp.x - r * 0.16}
                      y={lp.y - r * 0.16}
                      width={r * 0.32}
                      height={r * 0.32}
                      clipPath={`url(#wedge-${i})`}
                      preserveAspectRatio="xMidYMid slice"
                      transform={`rotate(${flip ? labelAngle + 180 : labelAngle} ${lp.x} ${lp.y})`}
                    />
                  ) : (
                    <text
                      x={lp.x}
                      y={lp.y}
                      fill="#fff"
                      fontSize={fontSize}
                      fontWeight={800}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${flip ? labelAngle + 180 : labelAngle} ${lp.x} ${lp.y})`}
                      style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
                    >
                      {s.label.length > 14 ? s.label.slice(0, 13) + '…' : s.label}
                    </text>
                  )}
                </g>
              );
            })
          )}
        </g>
        {/* Hub / center image */}
        {centerOn ? (
          <>
            <defs>
              <clipPath id="hub-clip">
                <circle cx={cx} cy={cy} r={hubR * 1.6} />
              </clipPath>
            </defs>
            <image
              href={style.centerImage!.url as string}
              x={cx - hubR * 1.6}
              y={cy - hubR * 1.6}
              width={hubR * 3.2}
              height={hubR * 3.2}
              clipPath="url(#hub-clip)"
              preserveAspectRatio="xMidYMid slice"
            />
            <circle cx={cx} cy={cy} r={hubR * 1.6} fill="none" stroke="#fff" strokeWidth={3} />
          </>
        ) : (
          <circle cx={cx} cy={cy} r={hubR} fill="#0b0e14" stroke="#fff" strokeWidth={3} />
        )}
      </svg>
    </div>
  );
}

function wedgePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  // Full circle (single segment) can't be drawn with one arc — split into two.
  if (endDeg - startDeg >= 359.999) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  }
  const p1 = point(cx, cy, r, startDeg);
  const p2 = point(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}

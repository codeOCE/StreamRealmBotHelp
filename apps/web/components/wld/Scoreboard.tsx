'use client';

import React from 'react';

export interface WldConfig {
  layout: 'horizontal' | 'vertical';
  showDraws: boolean;
  showTitle: boolean;
  showLabels: boolean;
  title: string;
  labels: { win: string; loss: string; draw: string };
  colors: { win: string; loss: string; draw: string; text: string; title: string; background: string };
  font: { family: string; size: number; weight: number; uppercase: boolean; letterSpacing: number };
  box: { backgroundOpacity: number; radius: number; padding: number; gap: number; borderWidth: number; borderColor: string };
  separator: string;
}

export interface WldBoard {
  id: string;
  title: string;
  wins: number;
  losses: number;
  draws: number;
  config: WldConfig;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Pure renderer for a W/L/D board — shared by the overlay and dashboard preview. */
export default function Scoreboard({ board }: { board: WldBoard }) {
  const c = board.config;
  const stats: { key: string; value: number; color: string; label: string }[] = [
    { key: 'win', value: board.wins, color: c.colors.win, label: c.labels.win },
    { key: 'loss', value: board.losses, color: c.colors.loss, label: c.labels.loss },
  ];
  if (c.showDraws) stats.push({ key: 'draw', value: board.draws, color: c.colors.draw, label: c.labels.draw });

  const labelSize = Math.max(10, Math.round(c.font.size * 0.28));

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: Math.round(c.box.gap * 0.5),
        background: hexToRgba(c.colors.background, c.box.backgroundOpacity),
        borderRadius: c.box.radius,
        padding: c.box.padding,
        border: c.box.borderWidth ? `${c.box.borderWidth}px solid ${c.box.borderColor}` : 'none',
        fontFamily: `'${c.font.family}', system-ui, sans-serif`,
        lineHeight: 1,
      }}
    >
      {c.showTitle && c.title && (
        <div
          style={{
            color: c.colors.title,
            fontSize: labelSize,
            fontWeight: 800,
            letterSpacing: '0.25em',
            textTransform: c.font.uppercase ? 'uppercase' : 'none',
          }}
        >
          {c.title}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: c.layout === 'vertical' ? 'column' : 'row',
          alignItems: 'center',
          gap: c.box.gap,
        }}
      >
        {stats.map((s, i) => (
          <React.Fragment key={s.key}>
            {i > 0 && c.separator && (
              <span style={{ color: c.colors.text, fontSize: c.font.size, fontWeight: c.font.weight, opacity: 0.4 }}>
                {c.separator}
              </span>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  color: s.color,
                  fontSize: c.font.size,
                  fontWeight: c.font.weight,
                  letterSpacing: `${c.font.letterSpacing}px`,
                }}
              >
                {s.value}
              </span>
              {c.showLabels && (
                <span
                  style={{
                    color: c.colors.text,
                    fontSize: labelSize,
                    fontWeight: 700,
                    letterSpacing: '0.15em',
                    opacity: 0.75,
                    textTransform: c.font.uppercase ? 'uppercase' : 'none',
                  }}
                >
                  {s.label}
                </span>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { connectRealtime } from '@/lib/realtime';
import Wheel, {
  segmentArcs,
  spinToAngle,
  spinDuration,
  spinExtraTurns,
  wheelSizePx,
  styleFromConfig,
  DEFAULT_WHEEL_CONFIG,
  type WheelSegment,
  type WheelConfig,
} from '@/components/wheel/Wheel';

const BASE = apiUrl('/api/integrations/wheel-spin/public');

/**
 * OBS browser-source overlay for a wheel. Transparent background; listens on
 * `wheel:<wheelId>` and animates to the segment the creator's spin landed on,
 * honoring the wheel's saved customization (size, pointer, speed, sounds…).
 */
export default function WheelOverlayPage() {
  const params = useParams();
  const wheelId = params.wheelId as string;

  const [segments, setSegments] = useState<WheelSegment[]>([]);
  const [config, setConfig] = useState<WheelConfig>(DEFAULT_WHEEL_CONFIG);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const rotationRef = useRef(0);
  const segmentsRef = useRef<WheelSegment[]>([]);
  const configRef = useRef<WheelConfig>(DEFAULT_WHEEL_CONFIG);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    if (!wheelId) return;

    fetch(`${BASE}/wheels/${wheelId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.wheel) {
          setSegments(data.wheel.segments || []);
          if (data.wheel.config) setConfig(data.wheel.config);
        }
      });

    return connectRealtime(`wheel:${wheelId}`, (event, data) => {
      if (event !== 'wheel.spin') return;
      const segs = segmentsRef.current;
      const cfg = configRef.current;
      const arc = segmentArcs(segs)[data.index];
      if (!arc) return;
      const next = spinToAngle(rotationRef.current, arc.mid, cfg.pointer.angle, spinExtraTurns(cfg.spinSpeed));
      rotationRef.current = next;
      setResult(null);
      setSpinning(true);
      setRotation(next);

      // Spinning sound (best-effort; overlays usually allow autoplay).
      if (cfg.announce.spinSound.enabled && cfg.announce.spinSound.url) {
        const a = new Audio(cfg.announce.spinSound.url);
        a.loop = true;
        a.play().catch(() => undefined);
        spinAudio.current = a;
      }

      const durMs = spinDuration(cfg.spinSpeed) * 1000 + 100;
      if (resultTimer.current) clearTimeout(resultTimer.current);
      resultTimer.current = setTimeout(() => {
        setSpinning(false);
        if (spinAudio.current) {
          spinAudio.current.pause();
          spinAudio.current = null;
        }
        if (cfg.announce.sound.enabled && cfg.announce.sound.url) {
          new Audio(cfg.announce.sound.url).play().catch(() => undefined);
        }
        if (cfg.announce.enabled) {
          setResult(data.label);
          setTimeout(() => setResult(null), 6000);
        }
        // Remove-on-select: drop the wedge after the reveal so the next spin is fair.
        if (data.removeIndex != null) {
          setSegments((prev) => prev.filter((_, i) => i !== data.removeIndex));
        }
      }, durMs);
    });
  }, [wheelId]);

  const px = wheelSizePx(config.size);

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden flex flex-col items-center justify-center gap-6">
      <Wheel
        segments={segments}
        rotation={rotation}
        spinning={spinning}
        size={px}
        durationSec={spinDuration(config.spinSpeed)}
        style={styleFromConfig(config)}
      />
      {result && (
        <div className="px-8 py-4 rounded-3xl bg-black/60 backdrop-blur-md border border-emerald-400/40 text-emerald-200 font-black text-3xl uppercase tracking-wide animate-in zoom-in-95 fade-in duration-300">
          {result}
        </div>
      )}
    </div>
  );
}

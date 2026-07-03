'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { connectRealtime } from '@/lib/realtime';

interface Redemption { id: number; viewer: string; item: string; }

/**
 * OBS browser-source overlay for The Royal Shop. Transparent background;
 * listens on `shop:<streamerId>` (the same broadcast `!buy` fires) and shows a
 * transient castle-themed alert for each redemption. Add as a browser source
 * with URL `/overlay/shop/<streamerId>`.
 */
export default function ShopOverlayPage() {
  const { streamerId } = useParams<{ streamerId: string }>();
  const [current, setCurrent] = useState<Redemption | null>(null);
  const queue = useRef<Redemption[]>([]);
  const showing = useRef(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!streamerId) return;

    const next = () => {
      const item = queue.current.shift();
      if (!item) { showing.current = false; return; }
      showing.current = true;
      setCurrent(item);
      setTimeout(() => { setCurrent(null); setTimeout(next, 400); }, 6000);
    };

    return connectRealtime(`shop:${streamerId}`, (event, data) => {
      if (event !== 'redemption' || !data?.viewer) return;
      queue.current.push({ id: ++seq.current, viewer: String(data.viewer), item: String(data.item ?? 'a reward') });
      if (!showing.current) next();
    });
  }, [streamerId]);

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden flex items-start justify-center pt-16">
      {current && (
        <div
          key={current.id}
          className="flex items-center gap-4 px-8 py-5 rounded-3xl bg-black/70 backdrop-blur-md border border-brand-primary/50 shadow-2xl animate-in zoom-in-95 fade-in slide-in-from-top-4 duration-300"
        >
          <span className="text-4xl">👑</span>
          <div className="text-white">
            <p className="font-black text-2xl leading-tight">
              <span className="text-brand-primary">{current.viewer}</span> redeemed
            </p>
            <p className="font-bold text-lg text-amber-200">{current.item}</p>
          </div>
        </div>
      )}
    </div>
  );
}

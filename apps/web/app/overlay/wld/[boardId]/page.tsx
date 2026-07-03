'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { connectRealtime } from '@/lib/realtime';
import Scoreboard, { type WldBoard } from '@/components/wld/Scoreboard';

const BASE = apiUrl('/api/integrations/win-loss-draw/public');

/**
 * OBS browser-source overlay for a Win/Loss/Draw board. Transparent background;
 * listens on `wld:<boardId>` and re-renders instantly when the creator changes
 * the score or restyles the board.
 */
export default function WldOverlayPage() {
  const params = useParams();
  const boardId = params.boardId as string;
  const [board, setBoard] = useState<WldBoard | null>(null);

  useEffect(() => {
    if (!boardId) return;
    fetch(`${BASE}/boards/${boardId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.board && setBoard(data.board));
    return connectRealtime(`wld:${boardId}`, (event, data) => {
      if (event === 'wld.update' && data?.id) setBoard(data as WldBoard);
    });
  }, [boardId]);

  // Preload the configured Google Font.
  const fontFamily = board?.config.font.family;

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden flex items-start justify-start p-6">
      {fontFamily && (
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, '+')}:wght@400;700;800;900&display=swap`}
        />
      )}
      {board && <Scoreboard board={board} />}
    </div>
  );
}

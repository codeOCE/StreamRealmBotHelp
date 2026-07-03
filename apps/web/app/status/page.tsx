'use client';

import { useEffect, useState } from 'react';
import { fetchJsonDetailed } from '@/lib/api';

// ponytail: single live check against /api/health. Add per-component history /
// incident timeline only if people actually ask for a real status dashboard.
export default function StatusPage() {
  const [state, setState] = useState<'loading' | 'up' | 'degraded' | 'down'>('loading');
  const [checkedAt, setCheckedAt] = useState<string>('');

  useEffect(() => {
    let active = true;
    const check = async () => {
      const { data, ok, status } = await fetchJsonDetailed('/api/health');
      if (!active) return;
      const db = (data as { db?: string } | null)?.db;
      setState(ok && db === 'ok' ? 'up' : status === 0 ? 'down' : 'degraded');
      setCheckedAt(new Date().toLocaleTimeString());
    };
    check();
    const id = setInterval(check, 15000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const meta = {
    loading: { dot: 'bg-zinc-500', label: 'Checking…' },
    up: { dot: 'bg-emerald-500', label: 'All systems operational' },
    degraded: { dot: 'bg-amber-500', label: 'Degraded — some checks failing' },
    down: { dot: 'bg-rose-500', label: 'API unreachable' },
  }[state];

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-black tracking-tight">CreatorCastle Status</h1>
      <div className="flex items-center gap-4 px-6 py-4 rounded-2xl border border-white/10 bg-white/[0.02]">
        <span className={`w-3 h-3 rounded-full ${meta.dot} animate-pulse`} />
        <span className="font-bold">{meta.label}</span>
      </div>
      {checkedAt && <p className="text-xs text-zinc-600">Last checked {checkedAt} · auto-refreshes every 15s</p>}
    </main>
  );
}

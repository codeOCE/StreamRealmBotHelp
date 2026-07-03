'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  Heart, Star, CircleDollarSign, Users, Gem, Bot,
  ChevronLeft, ChevronRight, VolumeX, LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { VoidSelect } from '@/components/dashboard/VoidSelect';
import { apiUrl, fetchJson, parseJsonResponse } from '@/lib/api';
import { toast } from 'sonner';

type Period = 'month' | 'week' | 'year';

/** Rolling window of stored analytics (months, including the current month). */
export const ANALYTICS_RETENTION_MONTHS = 12;

function earliestAnalyticsDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - (ANALYTICS_RETENTION_MONTHS - 1));
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function clampSince(date: Date): Date {
  const floor = earliestAnalyticsDate();
  return date < floor ? floor : date;
}
type ChartTab = 'tips' | 'followers' | 'subscribers' | 'bits' | 'raids';
type TipsMode = 'amount' | 'count';

export interface TwitchStats {
  followers: number;
  subscribers: number | null;
  viewers: number;
  isLive: boolean;
  streamTitle: string | null;
  gameName: string | null;
  channelName: string | null;
}

export interface Overview {
  retentionMonths?: number;
  oldestAvailable?: string;
  tipTotalCents: number;
  tipCount: number;
  periodEvents: { follow: number; subscribe: number; cheer: number; raid: number; donation: number };
  bitsTotal: number;
  raidViewers: number;
  activity: { type: string; user: string; action: string; at: string }[];
  dailySeries: {
    date: string;
    tipsCents: number;
    tipCount: number;
    follows: number;
    subs: number;
    bits: number;
    raids: number;
  }[];
}

const CHART_TABS: { id: ChartTab; label: string }[] = [
  { id: 'tips', label: 'Tips' },
  { id: 'followers', label: 'Followers' },
  { id: 'subscribers', label: 'Subscribers' },
  { id: 'bits', label: 'Bits' },
  { id: 'raids', label: 'Raids' },
];

function periodStart(period: Period, anchor: Date): Date {
  const d = new Date(anchor);
  if (period === 'week') {
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return clampSince(d);
  }
  if (period === 'year') return earliestAnalyticsDate();
  return clampSince(new Date(d.getFullYear(), d.getMonth(), 1));
}

const VISIBLE_MONTHS = 6;
/** Pages needed to browse the full retention window (6 months per page × 12 months = 2 pages). */
const MAX_MONTH_PAGE = Math.max(0, Math.ceil(ANALYTICS_RETENTION_MONTHS / VISIBLE_MONTHS) - 1);

function getMonthWindow(page: number): { label: string; date: Date }[] {
  const now = new Date();
  const floor = earliestAnalyticsDate();
  const maxOffset = ANALYTICS_RETENTION_MONTHS - 1;
  const endOffset = page * VISIBLE_MONTHS;

  return Array.from({ length: VISIBLE_MONTHS }, (_, i) => {
    const offset = endOffset + (VISIBLE_MONTHS - 1 - i);
    if (offset > maxOffset) return null;
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    if (d < floor) return null;
    return {
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      date: d,
    };
  }).filter((m): m is { label: string; date: Date } => m !== null);
}

function MetricsSelect({
  value,
  onChange,
  options,
  compact,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  compact?: boolean;
  className?: string;
}) {
  return (
    <VoidSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      compact={compact}
      className={className}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </VoidSelect>
  );
}

function fmtMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

function fmtNum(n: number) {
  return n.toLocaleString();
}

type SlideDir = 'older' | 'newer';
const SLIDE_MS = 320;

function MonthPeriodStrip({
  monthPage,
  period,
  monthAnchor,
  onSelectMonth,
  onPageChange,
}: {
  monthPage: number;
  period: Period;
  monthAnchor: Date;
  onSelectMonth: (date: Date) => void;
  onPageChange: (page: number) => void;
}) {
  const [slide, setSlide] = useState<{ from: number; to: number; dir: SlideDir } | null>(null);

  const goPage = useCallback((next: number, dir: SlideDir) => {
    if (slide || next === monthPage) return;
    if (next < 0 || next > MAX_MONTH_PAGE) return;
    setSlide({ from: monthPage, to: next, dir });
    window.setTimeout(() => {
      onPageChange(next);
      setSlide(null);
    }, SLIDE_MS);
  }, [slide, monthPage, onPageChange]);

  const renderMonths = (page: number) => getMonthWindow(page).map((m) => {
    const active = period === 'month'
      && m.date.getMonth() === monthAnchor.getMonth()
      && m.date.getFullYear() === monthAnchor.getFullYear();
    return (
      <button
        key={`${m.date.getFullYear()}-${m.date.getMonth()}`}
        type="button"
        onClick={() => onSelectMonth(m.date)}
        className={cn(
          'flex-1 min-w-0 px-2 py-2.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer border truncate text-center',
          active
            ? 'bg-brand-primary/15 text-brand-primary border-brand-primary/30'
            : 'bg-white/[0.02] text-zinc-500 border-white/[0.06] hover:text-zinc-300 hover:border-white/10',
        )}
      >
        {m.label}
      </button>
    );
  });

  return (
    <>
      <button
        type="button"
        aria-label="Older months"
        disabled={monthPage >= MAX_MONTH_PAGE || !!slide}
        onClick={() => goPage(monthPage + 1, 'older')}
        className="month-arrow month-arrow-nudge-left shrink-0 w-10 rounded-xl border border-white/[0.08] bg-white/[0.02] text-zinc-500 hover:text-white hover:border-white/15 hover:bg-white/[0.04] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="month-strip-viewport">
        {slide && (
          <div
            className={cn(
              'month-strip-track is-layer',
              slide.dir === 'older' ? 'month-strip-exit-left' : 'month-strip-exit-right',
            )}
          >
            {renderMonths(slide.from)}
          </div>
        )}
        <div
          className={cn(
            'month-strip-track',
            slide?.dir === 'older' && 'month-strip-enter-from-right',
            slide?.dir === 'newer' && 'month-strip-enter-from-left',
          )}
        >
          {renderMonths(slide?.to ?? monthPage)}
        </div>
      </div>

      <button
        type="button"
        aria-label="Newer months"
        disabled={monthPage === 0 || !!slide}
        onClick={() => goPage(monthPage - 1, 'newer')}
        className="month-arrow month-arrow-nudge-right shrink-0 w-10 rounded-xl border border-white/[0.08] bg-white/[0.02] text-zinc-500 hover:text-white hover:border-white/15 hover:bg-white/[0.04] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </>
  );
}

function chartPoint(tab: ChartTab, row: Overview['dailySeries'][0], tipsMode: TipsMode): number {
  switch (tab) {
    case 'tips': return tipsMode === 'amount' ? row.tipsCents / 100 : row.tipCount;
    case 'followers': return row.follows;
    case 'subscribers': return row.subs;
    case 'bits': return row.bits;
    case 'raids': return row.raids;
  }
}

function formatChartValue(tab: ChartTab, val: number, tipsMode: TipsMode) {
  if (tab === 'tips' && tipsMode === 'amount') return fmtMoney(Math.round(val * 100));
  return fmtNum(Math.round(val));
}

function StatCard({
  icon: Icon,
  value,
  label,
  hint,
  loading,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  hint: string;
  loading?: boolean;
}) {
  return (
    <div className="stat-card group relative overflow-hidden">
      <div className="flex items-start justify-between mb-3 relative z-10">
        <span className="text-brand-primary/70 group-hover:text-brand-primary transition-colors">
          <Icon className="w-5 h-5" strokeWidth={2.25} />
        </span>
      </div>
      <div className="relative z-10">
        {loading ? <div className="skeleton h-8 w-16 rounded-lg mb-2" /> : <p className="metric-value text-2xl xl:text-3xl">{value}</p>}
        <p className="text-xs font-semibold text-zinc-400 mt-1">{label}</p>
        <p className="text-xs text-zinc-600 mt-0.5 line-clamp-1">{hint}</p>
      </div>
    </div>
  );
}

function MetricsLineChart({
  series,
  tab,
  tipsMode,
  loading,
}: {
  series: Overview['dailySeries'];
  tab: ChartTab;
  tipsMode: TipsMode;
  loading: boolean;
}) {
  const values = series.map((r) => chartPoint(tab, r, tipsMode));
  const max = Math.max(...values, 1);
  const w = 640;
  const h = 200;
  const pad = { t: 12, r: 12, b: 28, l: 36 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const points = values.map((v, i) => {
    const x = pad.l + (values.length <= 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
    const y = pad.t + innerH - (v / max) * innerH;
    return { x, y, v, date: series[i]?.date ?? '' };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1]?.x.toFixed(1) ?? pad.l} ${(pad.t + innerH).toFixed(1)} L ${points[0]?.x.toFixed(1) ?? pad.l} ${(pad.t + innerH).toFixed(1)} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: pad.t + innerH - t * innerH,
    label: formatChartValue(tab, max * t, tipsMode),
  }));

  if (loading) return <div className="skeleton h-full min-h-[200px] w-full rounded-xl" />;

  if (!series.length) {
    return (
      <div className="h-full min-h-[200px] flex items-center justify-center rounded-xl border border-dashed border-white/[0.06] bg-white/[0.01]">
        <p className="text-[11px] text-zinc-600 font-medium">No data for this period yet</p>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[200px]">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={pad.l} y1={tick.y} x2={w - pad.r} y2={tick.y} stroke="rgba(255,255,255,0.04)" strokeDasharray="4 6" />
            <text x={pad.l - 6} y={tick.y + 3} textAnchor="end" fill="#52525b" fontSize="9" fontWeight="700">{tick.label}</text>
          </g>
        ))}
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(63,170,255,0.08)" />
            <stop offset="100%" stopColor="rgba(63,170,255,0)" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#chartFill)" />
        <path d={linePath} fill="none" stroke="#3faaff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#3faaff" stroke="#05070a" strokeWidth="1.5" opacity={p.v > 0 ? 1 : 0} />
        ))}
        {points.filter((_, i) => i % Math.ceil(points.length / 6) === 0 || i === points.length - 1).map((p) => (
          <text key={p.date} x={p.x} y={h - 6} textAnchor="middle" fill="#52525b" fontSize="9" fontWeight="700">
            {new Date(p.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        ))}
      </svg>
    </div>
  );
}

function SidebarPanel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('bento-card !rounded-2xl p-5 space-y-4', className)}>
      <p className="text-xs font-semibold text-zinc-400">{title}</p>
      {children}
    </div>
  );
}

export function DashboardMetrics() {
  const [period, setPeriod] = useState<Period>('month');
  const [monthAnchor, setMonthAnchor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [monthPage, setMonthPage] = useState(0);
  const [chartTab, setChartTab] = useState<ChartTab>('tips');
  const [tipsMode, setTipsMode] = useState<TipsMode>('amount');
  const [twitch, setTwitch] = useState<TwitchStats | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [botConnected, setBotConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [botBusy, setBotBusy] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [gameDraft, setGameDraft] = useState('');
  const [savingStream, setSavingStream] = useState(false);
  const [catResults, setCatResults] = useState<{ id: string; name: string; boxArt: string }[]>([]);
  const [catOpen, setCatOpen] = useState(false);
  const catTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catSeq = useRef(0);
  const catBoxRef = useRef<HTMLDivElement>(null);

  const onGameChange = (v: string) => {
    setGameDraft(v);
    if (catTimer.current) clearTimeout(catTimer.current);
    if (!v.trim()) { setCatResults([]); setCatOpen(false); return; }
    const seq = ++catSeq.current;
    catTimer.current = setTimeout(async () => {
      const data = (await fetchJson(`/api/dashboard/categories?q=${encodeURIComponent(v)}`)) as { categories?: { id: string; name: string; boxArt: string }[] } | null;
      if (seq !== catSeq.current) return; // a newer keystroke already fired — drop this stale response
      setCatResults(data?.categories ?? []);
      setCatOpen(true);
    }, 200);
  };

  useEffect(() => {
    const close = (e: MouseEvent) => { if (catBoxRef.current && !catBoxRef.current.contains(e.target as Node)) setCatOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const since = useMemo(() => periodStart(period, monthAnchor).toISOString(), [period, monthAnchor]);
  const periodLabel = period === 'week' ? 'this week' : period === 'year' ? 'last 12 months' : 'this month';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, overviewRes, botRes] = await Promise.all([
        fetchJson('/api/dashboard/stats'),
        fetchJson(`/api/dashboard/overview?since=${encodeURIComponent(since)}`),
        fetchJson('/api/integrations/bot/status'),
      ]);
      if (statsRes && typeof statsRes === 'object') {
        const s = statsRes as TwitchStats;
        setTwitch(s);
        setTitleDraft(s.streamTitle ?? '');
        setGameDraft(s.gameName ?? '');
      }
      if (overviewRes && typeof overviewRes === 'object' && !('error' in overviewRes)) setOverview(overviewRes as Overview);
      setBotConnected(
        botRes && typeof botRes === 'object' && 'connected' in botRes
          ? !!(botRes as { connected?: boolean }).connected
          : false,
      );
    } finally {
      setLoading(false);
    }
  }, [since]);

  useEffect(() => { load(); }, [load]);

  const botAction = async (action: 'join' | 'leave') => {
    setBotBusy(true);
    try {
      const res = await fetch(apiUrl(`/api/integrations/bot/${action}`), { method: 'POST', credentials: 'include' });
      const data = (await parseJsonResponse(res)) as { message?: string } | null;
      if (!res.ok) { toast.error(data?.message || 'Bot action failed'); return; }
      toast.success(action === 'join' ? 'Bot connected to chat' : 'Bot disconnected');
      setBotConnected(action === 'join');
    } finally {
      setBotBusy(false);
    }
  };

  const saveStream = async () => {
    setSavingStream(true);
    try {
      const res = await fetch(apiUrl('/api/dashboard/channel'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: titleDraft, game: gameDraft }),
      });
      const data = (await parseJsonResponse(res)) as { success?: boolean; error?: string } | null;
      if (!data?.success) { toast.error(data?.error || 'Could not update stream'); return; }
      toast.success('Stream updated on Twitch');
      await load();
    } finally {
      setSavingStream(false);
    }
  };

  // All cards show what was GAINED in the selected period (not lifetime totals).
  const cards = [
    { icon: Heart, value: `+${fmtNum(overview?.periodEvents.follow ?? 0)}`, label: 'New followers', hint: periodLabel },
    { icon: Star, value: `+${fmtNum(overview?.periodEvents.subscribe ?? 0)}`, label: 'New subs', hint: periodLabel },
    {
      icon: CircleDollarSign,
      value: fmtMoney(overview?.tipTotalCents ?? 0),
      label: 'Tips',
      hint: overview?.tipCount ? `${overview.tipCount} tip${overview.tipCount === 1 ? '' : 's'} ${periodLabel}` : `No tips ${periodLabel}`,
    },
    { icon: Gem, value: fmtNum(overview?.bitsTotal ?? 0), label: 'Bits', hint: `Cheered ${periodLabel}` },
    {
      icon: Users,
      value: `+${fmtNum(overview?.periodEvents.raid ?? 0)}`,
      label: 'Raids',
      hint: `${fmtNum(overview?.raidViewers ?? 0)} raid viewers ${periodLabel}`,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Period bar */}
      <div className="flex items-stretch gap-2 w-full">
        <MonthPeriodStrip
          monthPage={monthPage}
          period={period}
          monthAnchor={monthAnchor}
          onSelectMonth={(date) => { setPeriod('month'); setMonthAnchor(date); }}
          onPageChange={setMonthPage}
        />

        <div className="shrink-0 w-[7.5rem]">
          <MetricsSelect
            value={period}
            onChange={(v) => setPeriod(v as Period)}
            compact
            className="!w-full"
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
              { value: 'year', label: '12 months' },
            ]}
          />
        </div>
      </div>

      {twitch?.isLive && (
        <div className="live-banner">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="live-dot shrink-0" aria-hidden />
              <span className="text-[10px] font-black  text-emerald-400">Live · {fmtNum(twitch.viewers)} viewers</span>
            </div>
            <p className="text-sm font-black text-white truncate">{twitch.streamTitle}</p>
            <p className="text-[11px] text-zinc-500 font-medium mt-0.5">{twitch.gameName || 'Streaming'}</p>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {cards.map((c) => <StatCard key={c.label} {...c} loading={loading} />)}
      </div>

      {/* Chart + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bento-card !rounded-2xl !p-0 overflow-hidden flex flex-col">
          <div className="flex items-center border-b border-white/[0.04] overflow-x-auto">
            {CHART_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setChartTab(tab.id)}
                className={cn(
                  'px-4 py-3.5 text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer relative shrink-0',
                  chartTab === tab.id ? 'text-white' : 'text-zinc-600 hover:text-zinc-400',
                )}
              >
                {tab.label}
                {chartTab === tab.id && <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-brand-primary rounded-full" />}
              </button>
            ))}
            {chartTab === 'tips' && (
              <div className="ml-auto mr-3 shrink-0 w-[6.5rem]">
                <MetricsSelect
                  value={tipsMode}
                  onChange={(v) => setTipsMode(v as TipsMode)}
                  compact
                  className="!w-full"
                  options={[
                    { value: 'amount', label: 'Amount' },
                    { value: 'count', label: 'Count' },
                  ]}
                />
              </div>
            )}
          </div>
          <div className="p-5 pt-4 flex-1 flex flex-col">
            <MetricsLineChart
              series={overview?.dailySeries ?? []}
              tab={chartTab}
              tipsMode={tipsMode}
              loading={loading}
            />
          </div>
        </div>

        <div className="space-y-4">
          <SidebarPanel title="Bot settings">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-brand-primary" />
              </div>
              <p className="text-sm font-bold text-white">
                {botConnected === null ? 'Checking…' : botConnected ? 'The bot is in your chat!' : 'Bot not connected'}
              </p>
            </div>
            <div className="flex gap-2">
              {botConnected ? (
                <>
                  <button
                    type="button"
                    disabled={botBusy}
                    onClick={() => botAction('leave')}
                    className="flex-1 py-2.5 rounded-xl text-[10px] font-black  border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <LogOut className="w-3 h-3 inline mr-1.5 -mt-0.5" />Part
                  </button>
                  <Link
                    href="/dashboard/moderation"
                    className="flex-1 py-2.5 rounded-xl text-[10px] font-black  border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 transition-colors text-center"
                  >
                    <VolumeX className="w-3 h-3 inline mr-1.5 -mt-0.5" />Mod
                  </Link>
                </>
              ) : (
                <button
                  type="button"
                  disabled={botBusy}
                  onClick={() => botAction('join')}
                  className="flex-1 py-2.5 rounded-xl text-[10px] font-black  border border-brand-primary/30 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Connect bot
                </button>
              )}
            </div>
          </SidebarPanel>

          <SidebarPanel title="Quick settings" className="!overflow-visible relative z-20">
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black  text-zinc-600">Stream title</span>
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="void-input w-full text-sm"
                  placeholder="Your stream title"
                  maxLength={140}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black  text-zinc-600">Category</span>
                <div className="relative" ref={catBoxRef}>
                  <input
                    value={gameDraft}
                    onChange={(e) => onGameChange(e.target.value)}
                    onFocus={() => { if (catResults.length) setCatOpen(true); }}
                    className="void-input w-full text-sm"
                    placeholder="Game or category"
                    maxLength={100}
                    autoComplete="off"
                  />
                  {catOpen && catResults.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-[#0d0f15] shadow-2xl p-1">
                      {catResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setGameDraft(c.name); setCatOpen(false); }}
                          className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left hover:bg-white/[0.06] transition-colors"
                        >
                          {c.boxArt && <img src={c.boxArt} alt="" className="w-8 h-11 rounded object-cover shrink-0 bg-white/5" />}
                          <span className="text-sm font-semibold text-zinc-200 truncate">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </label>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={saveStream}
                  disabled={savingStream}
                  className="saas-button !h-9 !px-5 !text-[10px] !font-black "
                >
                  {savingStream ? 'Saving…' : 'Update'}
                </button>
              </div>
            </div>
          </SidebarPanel>
        </div>
      </div>
    </div>
  );
}

export function useDashboardActivity(since?: string) {
  const [activity, setActivity] = useState<Overview['activity']>([]);
  const [loading, setLoading] = useState(true);

  const sinceIso = since ?? earliestAnalyticsDate().toISOString();

  useEffect(() => {
    setLoading(true);
    fetchJson(`/api/dashboard/overview?since=${encodeURIComponent(sinceIso)}`)
      .then((data) => {
        if (data && typeof data === 'object' && 'activity' in data && Array.isArray((data as Overview).activity)) {
          setActivity((data as Overview).activity);
        }
      })
      .finally(() => setLoading(false));
  }, [sinceIso]);

  return { activity, loading };
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const ACTIVITY_COLORS: Record<string, string> = {
  follow: '#10b981',
  subscribe: '#a78bfa',
  cheer: '#fbbf24',
  raid: '#ec4899',
  donation: '#3faaff',
};

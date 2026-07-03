"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BarChart3, Bot, ExternalLink, Grid3x3, Disc3, Layers, Link2, PowerOff, Puzzle, Settings,
  ShieldCheck, Swords, Trophy, Unlink, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { FeatureHeader, FeaturePage, LoadingGrid, Panel, SectionLabel } from '@/components/dashboard/FeatureUI';

const API_BASE = apiUrl('/api/integrations');

// Manifest `icon` (a lucide name) -> component. Fallback: Puzzle.
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Grid3x3, Disc3, Swords, Trophy, Layers,
};

const CATEGORY_STYLES: Record<string, string> = {
  game: 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary',
  engagement: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  utility: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  product: 'bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-400',
};

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: string;
  comingSoon?: boolean;
  externalUrl?: string;
  dashboardPath?: string;
  enabled: boolean;
}

export default function IntegrationsPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [tenant, setTenant] = useState<any>(null);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [botStatus, setBotStatus] = useState<any>(null);

  const fetchBotStatus = async () => {
    try {
      const res = await fetch(apiUrl('/api/integrations/bot/status'), { credentials: 'include' });
      setBotStatus(res.ok ? await res.json() : null);
    } catch { /* ignore */ }
  };

  const fetchCatalog = async () => {
    try {
      const res = await fetch(`${API_BASE}/catalog`, { credentials: 'include' });
      const data = await res.json();
      setCatalog(data.integrations || []);
    } catch (err) {
      console.error('Failed to load catalog', err);
    } finally {
      setCatalogLoading(false);
    }
  };

  const fetchTenantStatus = async () => {
    try {
      const userRes = await fetch(apiUrl('/api/user/me'), { credentials: 'include' }).catch(() => null);
      if (!userRes || !userRes.ok) return setTenant(null);
      const userData = await userRes.json();
      if (!userData.tenantId) return setTenant(null);
      const statusRes = await fetch(apiUrl(`/api/dashboard/onboarding/${userData.tenantId}`), { credentials: 'include' });
      const statusData = statusRes.ok ? await statusRes.json() : {};
      setTenant({
        id: userData.tenantId,
        name: userData.tenantName || userData.username,
        isConnected: userData.isConnected,
        botUsername: statusData.botUsername || null,
        hasTokens: statusData.hasLinkedBot || false,
      });
    } catch (err) {
      console.error('Failed to fetch status', err);
    }
  };

  useEffect(() => {
    fetchCatalog();
    fetchTenantStatus();
    fetchBotStatus();
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('bot') === 'connected') {
      toast.success('Bot account connected — chat will now post as the bot.');
    }
  }, []);

  const toggleIntegration = async (item: CatalogItem) => {
    if (item.comingSoon) return;
    setBusyId(item.id);
    const next = !item.enabled;
    try {
      const res = await fetch(`${API_BASE}/${item.id}/${next ? 'enable' : 'disable'}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      setCatalog((prev) => prev.map((c) => (c.id === item.id ? { ...c, enabled: next } : c)));
      toast.success(`${item.name} ${next ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Could not update integration');
    } finally {
      setBusyId(null);
    }
  };

  const handleBotAction = async (action: 'join' | 'leave' | 'unlink') => {
    if (!tenant?.id) return toast.error('Channel not found');
    setIsActionLoading(action);
    try {
      const res = await fetch(`${API_BASE}/bot/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant.id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setTimeout(fetchTenantStatus, 1000);
      } else {
        toast.error(data.error || 'Something went wrong');
      }
    } catch {
      toast.error('Connection failed');
    } finally {
      setIsActionLoading(null);
    }
  };

  return (
    <FeaturePage>
      <FeatureHeader
        icon={Link2}
        title="Integrations"
        subtitle="Enable interactive features and connect your platforms."
      />

      <section className="space-y-5">
        <SectionLabel>Features</SectionLabel>
        {catalogLoading ? (
          <LoadingGrid cols={3} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {catalog.map((item) => {
              const Icon = (item.icon && ICONS[item.icon]) || Puzzle;
              return (
                <div
                  key={item.id}
                  className={cn(
                    'bento-card holo-card p-6 flex flex-col',
                    item.comingSoon && 'opacity-50',
                  )}
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-brand-primary">
                      <Icon className="w-7 h-7" />
                    </div>
                    <span className={cn('px-3 py-1 rounded-lg border text-[9px] font-black ', CATEGORY_STYLES[item.category] || CATEGORY_STYLES.utility)}>
                      {item.category}
                    </span>
                  </div>

                  <h3 className="text-lg font-black text-white tracking-tight">{item.name}</h3>
                  <p className="text-[12px] text-zinc-500 font-medium leading-relaxed mt-1.5 flex-1">{item.description}</p>

                  <div className="mt-6 pt-5 border-t border-white/5 flex items-center justify-between gap-3">
                    {item.comingSoon ? (
                      <span className="text-[10px] font-black  text-zinc-700">Coming soon</span>
                    ) : (
                      <button
                        onClick={() => toggleIntegration(item)}
                        disabled={busyId === item.id}
                        className="flex items-center gap-2.5 group cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                        title={item.enabled ? 'Enabled' : 'Disabled'}
                      >
                        <span className={cn('w-11 h-6 rounded-full p-1 transition-[background-color,box-shadow] duration-300 border border-white/10', item.enabled ? 'bg-brand-primary shadow-glow-p' : 'bg-zinc-800')}>
                          <span className={cn('block w-4 h-4 bg-white rounded-full transition-transform', item.enabled && 'translate-x-5')} />
                        </span>
                        <span className="text-[10px] font-black  text-zinc-500 group-hover:text-white transition-colors">
                          {item.enabled ? 'On' : 'Off'}
                        </span>
                      </button>
                    )}

                    {item.externalUrl ? (
                      <a href={item.externalUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-white">
                        Open <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : item.dashboardPath ? (
                      <Link href={item.dashboardPath} className="flex items-center gap-1.5 text-[11px] font-black  text-brand-primary hover:text-white">
                        <Settings className="w-3.5 h-3.5" /> Configure
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-5">
        <SectionLabel>Channel</SectionLabel>
        <Panel className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-[#9146FF]/15 border border-[#9146FF]/30 flex items-center justify-center text-2xl font-black text-white">T</div>
            <div>
              <h3 className="text-xl font-black text-white">Twitch</h3>
              <p className="text-[11px] font-black  mt-1 text-zinc-500">
                {tenant?.isConnected ? 'Bot online' : tenant?.hasTokens ? 'Standby' : 'Disconnected'}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            {tenant?.isConnected ? (
              <button onClick={() => handleBotAction('leave')} disabled={isActionLoading === 'leave'} className="saas-button-secondary flex items-center gap-2">
                <PowerOff className="w-4 h-4" /> Disconnect Bot
              </button>
            ) : (
              <button onClick={() => handleBotAction('join')} disabled={isActionLoading === 'join'} className="saas-button flex items-center gap-2">
                <Zap className="w-4 h-4 fill-current" /> Connect Bot
              </button>
            )}
            <button onClick={() => handleBotAction('unlink')} disabled={isActionLoading === 'unlink'} className="saas-button-secondary flex items-center gap-2">
              <Unlink className="w-4 h-4" /> Unlink
            </button>
          </div>
        </Panel>

        <Panel className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
              <Bot className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">Bot account</h3>
              <p className="text-[11px] font-black  mt-1 text-zinc-500">
                {botStatus?.platformBot?.connected
                  ? `Posting as ${botStatus.platformBot.username}`
                  : 'Not set — chat posts as you'}
              </p>
            </div>
          </div>
          <a
            href="/auth/bot"
            className={cn('flex items-center gap-2', botStatus?.platformBot?.connected ? 'saas-button-secondary' : 'saas-button')}
          >
            <Zap className="w-4 h-4" /> {botStatus?.platformBot?.connected ? 'Reconnect bot account' : 'Connect bot account'}
          </a>
        </Panel>

        {/* Song requests (SpotifyPanel) shelved pending a music-licensing/DMCA
            policy decision — backend stays dormant while SPOTIFY_CLIENT_ID is
            unset. Re-enable by rendering <SpotifyPanel /> and setting secrets. */}

        <DiscordPanel />

        <BackfillPanel />

        <Panel className="flex items-center gap-5 !bg-brand-primary/[0.03] !border-brand-primary/10">
          <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <p className="text-sm text-zinc-500 font-medium leading-relaxed">
            Connect a dedicated <span className="text-white">bot account</span> so messages come from the bot, not your channel. Without it, the bot posts as you. Relinking the bot <span className="text-white">won't affect</span> your saved commands, games, or viewer data.
          </p>
        </Panel>
      </section>
    </FeaturePage>
  );
}

/** Spotify song requests — viewers queue tracks with !sr, straight to the creator's player. */
function SpotifyPanel() {
  const [sp, setSp] = useState<{ connected: boolean; srEnabled: boolean; srLevel: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchStatus = () => {
    fetch(API_BASE, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const s = data?.settings?.spotify;
        setSp(s ? { connected: true, srEnabled: s.srEnabled !== false, srLevel: s.srLevel ?? 'VIEWER' } : { connected: false, srEnabled: true, srLevel: 'VIEWER' });
      })
      .catch(() => setSp({ connected: false, srEnabled: true, srLevel: 'VIEWER' }));
  };
  useEffect(fetchStatus, []);

  const connect = () => {
    const w = 500, h = 750;
    const popup = window.open(
      apiUrl('/api/auth/spotify'),
      'Spotify OAuth',
      `width=${w},height=${h},left=${window.screenX + (window.outerWidth - w) / 2},top=${window.screenY + (window.outerHeight - h) / 2}`,
    );
    const poll = setInterval(() => {
      if (popup?.closed) { clearInterval(poll); fetchStatus(); }
    }, 800);
  };

  const update = async (patch: { srEnabled?: boolean; srLevel?: string }) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/spotify`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) { toast.error(data.error || 'Could not save'); return; }
      setSp((prev) => prev && { ...prev, srEnabled: data.srEnabled, srLevel: data.srLevel });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await fetch(apiUrl('/api/auth/spotify/disconnect'), { method: 'POST', credentials: 'include' });
      toast.success('Spotify disconnected');
      fetchStatus();
    } finally {
      setBusy(false);
    }
  };

  if (!sp) return null;

  return (
    <Panel className="flex flex-wrap items-center justify-between gap-6">
      <div className="flex items-center gap-5">
        <div className="w-14 h-14 rounded-2xl bg-[#1DB954]/15 border border-[#1DB954]/30 flex items-center justify-center text-xl font-black text-[#1DB954]">S</div>
        <div>
          <h3 className="text-xl font-black text-white">Song requests</h3>
          <p className="text-sm text-zinc-500 font-medium mt-1 max-w-md">
            {sp.connected
              ? <>Viewers queue tracks with <span className="text-white font-bold">!sr</span> and check what&rsquo;s playing with <span className="text-white font-bold">!song</span>. Songs land in your Spotify queue on whatever device is playing.</>
              : <>Connect Spotify and viewers can queue tracks with <span className="text-white font-bold">!sr</span> — straight into your listening queue, no extra player needed.</>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {sp.connected ? (
          <>
            <select
              value={sp.srLevel}
              onChange={(e) => update({ srLevel: e.target.value })}
              disabled={busy}
              className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-3 text-[11px] font-black text-zinc-300 focus:outline-none"
              aria-label="Who can request songs"
            >
              <option value="VIEWER">Everyone</option>
              <option value="SUBSCRIBER">Subs+</option>
              <option value="VIP">VIPs+</option>
              <option value="MODERATOR">Mods only</option>
            </select>
            <button
              onClick={() => update({ srEnabled: !sp.srEnabled })}
              disabled={busy}
              className={cn('flex items-center gap-2', sp.srEnabled ? 'saas-button' : 'saas-button-secondary')}
            >
              {sp.srEnabled ? 'Requests on' : 'Requests off'}
            </button>
            <button onClick={disconnect} disabled={busy} className="saas-button-secondary flex items-center gap-2">
              <Unlink className="w-4 h-4" /> Disconnect
            </button>
          </>
        ) : (
          <button onClick={connect} className="saas-button flex items-center gap-2">
            <Zap className="w-4 h-4" /> Connect Spotify
          </button>
        )}
      </div>
    </Panel>
  );
}

/** Discord go-live announcements — webhook URL + optional message template. */
function DiscordPanel() {
  const [d, setD] = useState<{ enabled: boolean; webhookUrl: string; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch(API_BASE, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const s = data?.settings?.discord ?? {};
        setD({ enabled: !!s.enabled, webhookUrl: s.webhookUrl ?? '', message: s.message ?? '' });
      })
      .catch(() => setD({ enabled: false, webhookUrl: '', message: '' }));
  }, []);

  const save = async (patch: Partial<NonNullable<typeof d>>, key = 'save') => {
    if (!d) return;
    setBusy(key);
    try {
      const res = await fetch(`${API_BASE}/discord`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...d, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) { toast.error(data.error || 'Could not save'); return; }
      setD(data.discord);
      toast.success('Discord settings saved');
    } catch {
      toast.error('Could not reach the API');
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      const res = await fetch(`${API_BASE}/discord/test`, { method: 'POST', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) toast.error(data.error || 'Test failed');
      else toast.success('Test message sent — check your Discord channel');
    } catch {
      toast.error('Could not reach the API');
    } finally {
      setBusy(null);
    }
  };

  if (!d) return null;

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-[#5865F2]/15 border border-[#5865F2]/30 flex items-center justify-center text-xl font-black text-[#8b95f6]">D</div>
          <div>
            <h3 className="text-xl font-black text-white">Discord go-live</h3>
            <p className="text-sm text-zinc-500 font-medium mt-1 max-w-md">
              Announce in your Discord server the moment you go live. Paste a channel webhook URL
              (Server Settings → Integrations → Webhooks).
            </p>
          </div>
        </div>
        <button
          onClick={() => save({ enabled: !d.enabled }, 'toggle')}
          disabled={!!busy || (!d.enabled && !d.webhookUrl)}
          className={cn('flex items-center gap-2', d.enabled ? 'saas-button' : 'saas-button-secondary')}
        >
          {busy === 'toggle' ? 'Saving…' : d.enabled ? 'Enabled' : 'Enable'}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 mt-6 pt-6 border-t border-white/5">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500">Webhook URL</label>
            <input
              type="url"
              value={d.webhookUrl}
              onChange={(e) => setD({ ...d, webhookUrl: e.target.value })}
              placeholder="https://discord.com/api/webhooks/…"
              className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-brand-primary/50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500">Message (optional)</label>
            <input
              type="text"
              value={d.message}
              onChange={(e) => setD({ ...d, message: e.target.value })}
              placeholder="{name} is live on Twitch! {url}"
              className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-brand-primary/50"
            />
            <p className="text-[9px] text-zinc-600 font-bold">Supports {'{name}'} {'{title}'} {'{game}'} {'{url}'} — @everyone works too.</p>
          </div>
        </div>
        <div className="flex md:flex-col gap-3 md:justify-end">
          <button onClick={() => save({})} disabled={!!busy} className="saas-button">
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button onClick={test} disabled={!!busy || !d.webhookUrl} className="saas-button-secondary">
            {busy === 'test' ? 'Sending…' : 'Send test'}
          </button>
        </div>
      </div>
    </Panel>
  );
}

/** Backfill historical analytics into the dashboard from Twitch + StreamElements. */
function BackfillPanel() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, route: string, label: (d: any) => string) => {
    setBusy(key);
    try {
      const res = await fetch(apiUrl(route), { method: 'POST', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) { toast.error(data.error || 'Import failed'); return; }
      toast.success(label(data));
    } catch {
      toast.error('Could not reach the API');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel className="flex flex-wrap items-center justify-between gap-6">
      <div className="flex items-center gap-5">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-brand-primary shrink-0">
          <BarChart3 className="w-7 h-7" />
        </div>
        <div>
          <h3 className="text-xl font-black text-white">Backfill analytics</h3>
          <p className="text-sm text-zinc-500 font-medium mt-1 max-w-md">
            Pull historical data into your dashboard. Twitch recovers your follower history; StreamElements adds past tips/alerts if you ran them. Safe to re-run.
          </p>
        </div>
      </div>
      <div className="flex gap-3 flex-wrap shrink-0">
        <button
          onClick={() => run('tw', '/api/integrations/twitch/import-followers', (d) => `Imported ${d.followers} followers from Twitch`)}
          disabled={!!busy}
          className="saas-button flex items-center gap-2"
        >
          <BarChart3 className="w-4 h-4" /> {busy === 'tw' ? 'Importing…' : 'Twitch followers'}
        </button>
        <button
          onClick={() => run('se', '/api/integrations/streamelements/import-analytics', (d) => `Imported ${d.events} events + ${d.tips} tips from StreamElements`)}
          disabled={!!busy}
          className="saas-button-secondary flex items-center gap-2"
        >
          {busy === 'se' ? 'Importing…' : 'StreamElements'}
        </button>
        <button
          onClick={() => run('sep', '/api/integrations/streamelements/import-points', (d) => `Imported point balances for ${d.imported} viewers${d.unresolved ? ` (${d.unresolved} could not be matched)` : ''}`)}
          disabled={!!busy}
          className="saas-button-secondary flex items-center gap-2"
        >
          {busy === 'sep' ? 'Importing…' : 'Viewer points'}
        </button>
      </div>
    </Panel>
  );
}

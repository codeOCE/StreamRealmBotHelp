'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { fetchCurrentUser, isDevSkipAuth } from '@/lib/dev-auth';

/* Primary nav — shown in the centre pill of the fixed top bar */
const TOP_NAV = [
  { href: '/dashboard',          label: 'Dashboard',    icon: 'grid',    exact: true },
  { href: '/dashboard/commands', label: 'Commands',     icon: 'terminal'             },
  { href: '/dashboard/loyalty',  label: 'Loyalty',      icon: 'star'                 },
  { href: '/dashboard/overlays', label: 'Overlays',     icon: 'layers'               },
  { href: '/dashboard/tools',    label: 'Tools',        icon: 'tool'                 },
] as const;

/* All sections — shown in the 280 px sticky sidebar */
const SIDEBAR_NAV = [
  { href: '/dashboard',              label: 'Dashboard',    icon: 'grid',     exact: true },
  { href: '/dashboard/commands',     label: 'Commands',     icon: 'terminal'              },
  { href: '/dashboard/moderation',   label: 'Moderation',   icon: 'shield'                },
  { href: '/dashboard/timers',       label: 'Timers',       icon: 'clock'                 },
  { href: '/dashboard/loyalty',      label: 'Loyalty',      icon: 'star'                  },
  { href: '/dashboard/tips',         label: 'Tips',         icon: 'heart'                 },
  { href: '/dashboard/shop',         label: 'Royal Shop',   icon: 'shop'                  },
  { href: '/dashboard/links',        label: 'Links',        icon: 'linktree'              },
  { href: '/dashboard/giveaways',    label: 'Giveaways',    icon: 'gift'                  },
  { href: '/dashboard/polls',        label: 'Polls',        icon: 'poll'                  },
  { href: '/dashboard/cosmetics',    label: 'Cosmetics',    icon: 'palette'               },
  { href: '/dashboard/xp',           label: 'Leaderboard',  icon: 'trophy'                },
  { href: '/dashboard/interactions', label: 'Interactions', icon: 'zap'                   },
  { href: '/dashboard/overlays',     label: 'Overlays',     icon: 'layers'                },
  { href: '/dashboard/intel',        label: 'Analytics',    icon: 'bar-chart'             },
  { href: '/dashboard/sentinel',     label: 'Sentinel',     icon: 'radar'                 },
  { href: '/dashboard/tools',        label: 'Tools',        icon: 'tool'                  },
  { href: '/dashboard/integrations', label: 'Integrations', icon: 'link'                  },
  { href: '/dashboard/settings',     label: 'Settings',     icon: 'settings'              },
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDevSkipAuth()) {
      fetchCurrentUser().then(d => { if (d) setUser(d); });
      return;
    }
    const justConnected = new URLSearchParams(window.location.search).get('connected') === 'true';
    fetchCurrentUser()
      .then(d => { if (d) setUser(d); else if (!justConnected) window.location.href = '/auth/twitch'; })
      .catch(() => { /* offline */ });
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <>
      {/* Fixed ambient background glow layer — reference: position:fixed, z-index:-1 */}
      <div className="saas-bg-glow saas-bg-glow-subtle" />

      {/* Subtle grid texture */}
      <div className="matrix-grid" />

      {/* ════════════════════════════════════════════
          FIXED TOP NAVBAR
          Reference: fixed top-0 w-full z-[500] h-20
          bg-void-bg/40 backdrop-blur-2xl border-b border-white/5
      ════════════════════════════════════════════ */}
      <nav
        className="fixed top-0 inset-x-0 z-[500] h-20 border-b border-white/5 flex items-center"
        style={{
          background: 'rgba(5,7,10,0.4)',
          backdropFilter: 'blur(72px) saturate(180%)',
          WebkitBackdropFilter: 'blur(72px) saturate(180%)',
        }}
      >
        <div className="w-full px-8 h-full flex items-center justify-between gap-6">

          {/* ── Left: Castle mark + wordmark ── */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0 group cursor-pointer">
            <div
              className="nav-logo-icon w-11 h-11 flex items-center justify-center overflow-hidden p-1.5 group-hover:scale-105 transition-transform duration-300"
              style={{
                borderRadius: '1rem',
                background: 'rgba(63,170,255,0.1)',
                boxShadow: '0 0 30px rgba(63,170,255,0.1), 0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              <img
                src="https://cdn.codeoce.com/logo/logo_white.png"
                alt="Creator Castle"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="hidden lg:flex flex-col">
              <span className="text-lg font-black uppercase tracking-tight text-white leading-none" style={{ fontFamily: 'var(--font-outfit), sans-serif' }}>
                Creator<span style={{ color: 'var(--void-accent)' }}>Castle</span>
              </span>
            </div>
          </Link>

          {/* ── Centre: Section nav pill — reference: #top-section-nav ── */}
          {/* hidden on mobile, visible md+ */}
          <div
            className="hidden md:flex items-center gap-1 flex-shrink-0"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.05)',
              padding: '0.25rem',
              borderRadius: '1rem',
              backdropFilter: 'blur(12px)',
            }}
          >
            {TOP_NAV.map(item => {
              const active = isActive(item.href, (item as any).exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn('section-nav-btn', active && 'active')}
                >
                  <NavIcon name={(item as any).icon} className="w-3 h-3 flex-shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* ── Right: live + cta + user ── */}
          <div className="flex items-center gap-4 flex-shrink-0">

            {/* Connect Bot CTA */}
            <Link href="/dashboard/integrations" className="saas-button hidden sm:inline-flex" style={{ padding: '0.5rem 1.25rem', fontSize: '0.625rem' }}>
              Connect Bot
            </Link>

            {/* User menu */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                className="nav-user-btn group flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
                style={{
                  borderRadius: '1rem',
                  padding: '0.125rem 0.5rem 0.125rem 0.125rem',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                <img
                  src={user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=guest'}
                  alt="Avatar"
                  className="w-10 h-10 object-cover"
                  style={{ borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <svg className="w-[10px] h-[10px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" style={{ color: 'var(--void-muted)' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-3 z-[600] overflow-hidden"
                  style={{
                    width: 'min(calc(100vw - 2rem), 20rem)',
                    background: 'var(--void-bg)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '1rem',
                    boxShadow: '0 25px 50px rgba(0,0,0,0.7)',
                  }}
                >
                  {/* Identity row */}
                  <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <img
                        src={user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=guest'}
                        alt=""
                        className="w-11 h-11 object-cover flex-shrink-0"
                        style={{ borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', background: 'var(--void-bg)' }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white tracking-tight truncate">{user?.username || 'Guest'}</p>
                        <p className="text-[10px] font-black  mt-0.5" style={{ color: 'var(--void-muted)' }}>Creator</p>
                      </div>
                    </div>
                  </div>
                  {/* Menu items */}
                  <div className="p-2">
                    {[
                      { href: '/dashboard/settings', label: 'Settings', icon: 'settings' },
                      { href: '/', label: 'Back to site', icon: 'home' },
                    ].map(item => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className="nav-menu-item flex items-center gap-3 px-3 py-2 rounded-xl text-[11px] font-bold"
                        style={{ color: 'var(--void-muted)' }}
                      >
                        <NavIcon name={item.icon} className="w-3.5 h-3.5 flex-shrink-0" />
                        {item.label}
                      </Link>
                    ))}
                    <button
                      className="nav-menu-danger w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[11px] font-bold text-left"
                      style={{ color: '#f87171' }}
                    >
                      <NavIcon name="logout" className="w-3.5 h-3.5 flex-shrink-0" />
                      Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </nav>

      {/* ════════════════════════════════════════════
          DASHBOARD CONTAINER
          Reference: padding-top: 5rem; min-height: 100vh
          Grid on desktop: 280px 1fr, gap: 2rem, padding: 2rem
          Max-width: 1600px, centred
      ════════════════════════════════════════════ */}
      <div style={{ paddingTop: '5rem', minHeight: '100vh' }}>
        <div
          className="dashboard-grid"
          style={{
            maxWidth: '1600px',
            margin: '0 auto',
          }}
        >

          {/* ── Sidebar ──
              Mobile: sticky top-20, horizontal scroll, blur bg
              Desktop: sticky top-[7rem], vertical, transparent bg, height: calc(100vh - 9rem)
          ── */}
          <aside className="dashboard-sidebar">
            {/* Label (desktop only) */}
            <p
              className="hidden lg:block text-[9px] font-black uppercase px-6 pt-4 pb-2 flex-shrink-0"
              style={{ color: 'var(--void-muted)', letterSpacing: '0.25em' }}
            >
              Navigation
            </p>

            {SIDEBAR_NAV.map(item => {
              const active = isActive(item.href, (item as any).exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn('dashboard-tab-btn', active && 'active')}
                >
                  <NavIcon name={item.icon} style={{ width: '1.5625rem', height: '1.5625rem', flexShrink: 0 }} />
                  <span className="hidden lg:inline">{item.label}</span>
                  {/* Mobile: show label below icon in a tiny line */}
                  <span className="lg:hidden text-[8px] leading-tight text-center" style={{ maxWidth: '3rem', whiteSpace: 'normal' }}>{item.label}</span>
                </Link>
              );
            })}
          </aside>

          {/* ── Content area ── */}
          <main
            className="min-w-0 overflow-x-hidden"
            style={{ minHeight: 'calc(100vh - 9rem)' }}
          >
            {isDevSkipAuth() && (
              <div className="mx-4 lg:mx-6 mb-4 px-4 py-2 rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-200 text-[10px] font-black ">
                Dev mode — auth bypassed
              </div>
            )}
            <div className="p-4 lg:p-6 max-w-7xl">
              {children}
            </div>
          </main>

        </div>
      </div>

      {/* Dashboard grid responsive CSS injected as a style tag to exactly match reference */}
      <style>{`
        .dashboard-grid {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          padding: 1rem;
        }
        @media (min-width: 1024px) {
          .dashboard-grid {
            display: grid;
            grid-template-columns: 280px 1fr;
            gap: 2rem;
            padding: 2rem;
          }
        }

        /* Mobile sidebar — sticky horizontal scroll strip */
        .dashboard-sidebar {
          position: sticky;
          top: 5rem;
          z-index: 50;
          display: flex;
          flex-direction: row;
          overflow-x: auto;
          gap: 0.5rem;
          padding: 0.5rem;
          background: rgba(5, 7, 10, 0.8);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          scrollbar-width: none;
          border-radius: 1rem;
        }
        .dashboard-sidebar::-webkit-scrollbar { display: none; }

        /* Mobile: make tabs more compact */
        @media (max-width: 1023px) {
          .dashboard-sidebar .dashboard-tab-btn {
            padding: 0.625rem 0.875rem;
            flex-direction: column;
            gap: 0.25rem;
            min-width: auto;
            text-align: center;
          }
        }

        /* Desktop sidebar — vertical sticky column */
        @media (min-width: 1024px) {
          .dashboard-sidebar {
            top: 7rem;
            height: calc(100vh - 9rem);
            flex-direction: column;
            overflow-x: visible;
            overflow-y: auto;
            padding: 0;
            background: transparent;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
            border-radius: 0;
            gap: 0.125rem;
            scrollbar-width: none;
          }
          .dashboard-sidebar::-webkit-scrollbar { display: none; }
        }
      `}</style>
    </>
  );
}

/* ─── SVG icon set ─── */
function NavIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const props = { className: cn('flex-shrink-0', className), style, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', strokeWidth: '2' } as const;
  switch (name) {
    case 'grid':      return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>;
    case 'bingo':     return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>;
    case 'wheel':     return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/><line x1="19.1" y1="4.9" x2="4.9" y2="19.1"/></svg>;
    case 'swords':    return <svg {...props}><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/><line x1="3" y1="19" x2="5" y2="21"/></svg>;
    case 'terminal':  return <svg {...props}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>;
    case 'shield':    return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case 'clock':     return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case 'star':      return <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case 'trophy':    return <svg {...props}><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg>;
    case 'zap':       return <svg {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case 'layers':    return <svg {...props}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>;
    case 'shop':      return <svg {...props}><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9h16v10a1 1 0 01-1 1H5a1 1 0 01-1-1V9z"/><path d="M9 13h6"/></svg>;
    case 'gift':      return <svg {...props}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>;
    case 'poll':      return <svg {...props}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
    case 'heart':     return <svg {...props}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
    case 'palette':   return <svg {...props}><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996C19.495 15.394 22 12.89 22 9.95 22 5.59 17.51 2 12 2z"/></svg>;
    case 'bar-chart': return <svg {...props}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
    case 'radar':     return <svg {...props}><path d="M12 2a10 10 0 100 20A10 10 0 0012 2z"/><path d="M12 12L8.5 5.5"/><circle cx="12" cy="12" r="3"/><path d="M12 12l6.5-1"/></svg>;
    case 'tool':      return <svg {...props}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>;
    case 'link':      return <svg {...props}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>;
    case 'linktree':  return <svg {...props}><rect x="4" y="4" width="16" height="4" rx="1.5"/><rect x="4" y="10" width="16" height="4" rx="1.5"/><rect x="4" y="16" width="16" height="4" rx="1.5"/></svg>;
    case 'settings':  return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
    case 'home':      return <svg {...props}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
    case 'logout':    return <svg {...props}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
    default:          return <div className={cn('rounded border border-current opacity-30', className)} style={style} />;
  }
}

import Link from 'next/link';
import { cn } from '@/lib/utils';

const DOC_LINKS = [
  {
    title: 'Getting started',
    items: [{ href: '/docs', label: 'Overview' }],
  },
  {
    title: 'Chat commands',
    items: [
      { href: '/docs/commands', label: 'Commands' },
      { href: '/docs/variables', label: 'Variables' },
    ],
  },
  {
    title: 'Engagement',
    items: [
      { href: '/docs/timers', label: 'Timers' },
      { href: '/docs/loyalty', label: 'Loyalty & Royal Shop' },
    ],
  },
  {
    title: 'Stream tools',
    items: [
      { href: '/docs/moderation', label: 'Moderation (Sentinel)' },
      { href: '/docs/overlays', label: 'Overlays & Widgets' },
    ],
  },
  {
    title: 'Migrating',
    items: [{ href: '/docs/importing', label: 'Importing' }],
  },
];

export function DocsShell({
  children,
  pathname,
}: {
  children: React.ReactNode;
  pathname?: string;
}) {
  return (
    <div className="min-h-screen bg-[#06080c] text-zinc-300 flex flex-col">
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 70% 45% at 10% -5%, rgba(63, 170, 255, 0.05) 0%, transparent 55%)',
          }}
        />
      </div>

      <header className="relative z-20 border-b border-white/[0.06] bg-[#06080c]/80 backdrop-blur-xl sticky top-0">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
              <div className="size-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform">
                <img
                  src="https://cdn.codeoce.com/logo/logo_white.png"
                  alt=""
                  className="size-full object-contain p-1"
                />
              </div>
              <span className="hidden sm:block text-sm font-bold text-white font-heading tracking-tight">
                Creator <span className="text-brand-primary">Castle</span>
              </span>
            </Link>
            <span className="text-zinc-700 hidden sm:block">/</span>
            <Link href="/docs" className="text-sm font-semibold text-zinc-400 hover:text-white transition-colors shrink-0">
              Docs
            </Link>
          </div>

          <Link
            href="/dashboard"
            className="text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-white border border-white/8 hover:border-white/15 rounded-lg px-3.5 py-2 transition-colors shrink-0"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="relative z-10 flex-1 max-w-[1400px] mx-auto w-full px-5 md:px-8 py-8 md:py-10">
        <div className="flex gap-10 xl:gap-14">
          <aside className="hidden md:block w-52 shrink-0">
            <nav className="sticky top-24 space-y-6">
              {DOC_LINKS.map((group) => (
                <div key={group.title}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600 mb-2 px-2">
                    {group.title}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = pathname === item.href;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={cn(
                              'block rounded-lg px-2 py-1.5 text-sm transition-colors',
                              active
                                ? 'text-white bg-white/[0.06] font-semibold'
                                : 'text-zinc-500 hover:text-white hover:bg-white/[0.03]',
                            )}
                          >
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          <main className="min-w-0 flex-1 pb-16">{children}</main>
        </div>
      </div>
    </div>
  );
}

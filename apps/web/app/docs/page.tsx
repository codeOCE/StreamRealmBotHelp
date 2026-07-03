import Link from 'next/link';
import { Braces, BookOpen, Terminal, Timer, Crown, ShieldAlert, LayoutTemplate, Import } from 'lucide-react';

const PAGES = [
  {
    href: '/docs/commands',
    title: 'Commands',
    description: 'Built-in commands, custom commands, permission levels, and cooldowns.',
    icon: Terminal,
  },
  {
    href: '/docs/variables',
    title: 'Variables',
    description: 'Placeholders for dynamic command responses — $(user), $(channel), counters, random picks, and more.',
    icon: Braces,
  },
  {
    href: '/docs/timers',
    title: 'Timers',
    description: 'Automatic, interval-based chat messages that respect chat activity.',
    icon: Timer,
  },
  {
    href: '/docs/loyalty',
    title: 'Loyalty & the Royal Shop',
    description: 'XP, levels, skills, Points, and redeeming rewards from your shop.',
    icon: Crown,
  },
  {
    href: '/docs/moderation',
    title: 'Moderation (Sentinel)',
    description: 'Auto-mod rule types, actions, and bypasses.',
    icon: ShieldAlert,
  },
  {
    href: '/docs/overlays',
    title: 'Overlays & Widgets',
    description: 'Build browser-source overlays with the visual editor and widget library.',
    icon: LayoutTemplate,
  },
  {
    href: '/docs/importing',
    title: 'Importing',
    description: 'Bring your commands and timers over from Nightbot or StreamElements.',
    icon: Import,
  },
];

export default function DocsHomePage() {
  return (
    <div className="max-w-3xl space-y-10">
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-primary/10 border border-brand-primary/20">
            <BookOpen className="size-5 text-brand-primary" strokeWidth={2.25} />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight font-heading">Documentation</h1>
        </div>
        <p className="text-sm text-zinc-500 leading-relaxed">
          Reference guides for Creator Castle — chat commands, variables, loyalty, moderation, and overlays.
        </p>
      </header>

      <div className="space-y-3">
        {PAGES.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className="group flex items-start gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 hover:border-brand-primary/30 hover:bg-brand-primary/[0.04] transition-colors"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06] text-zinc-500 group-hover:text-brand-primary group-hover:border-brand-primary/20 transition-colors">
              <page.icon className="size-5" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-white group-hover:text-brand-primary transition-colors">{page.title}</p>
              <p className="text-sm text-zinc-500 mt-1 leading-relaxed">{page.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

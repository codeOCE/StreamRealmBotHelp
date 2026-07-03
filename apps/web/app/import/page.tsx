import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Switch to Creator Castle — bring everything with you',
  description:
    'Import your chat commands, viewer point balances, tip history, and analytics in a few clicks. Your community keeps everything they earned.',
};

/* Import flow page — competitor names are allowed here (import UI context per
 * the no-competitor-references rule), but we describe the flow, not comparisons. */

const steps = [
  {
    n: '1',
    title: 'Connect Twitch',
    body: 'One click. Your commands, loyalty system, overlays, and alerts are provisioned immediately.',
  },
  {
    n: '2',
    title: 'Connect your old bot',
    body: 'Link Nightbot with OAuth or paste your StreamElements token. We read your setup — we never change or delete anything on the other side.',
  },
  {
    n: '3',
    title: 'Pick what to bring',
    body: 'Review every command before it imports. Legacy ${...} syntax converts automatically, and anything that needs a rewrite is flagged up front.',
  },
];

const bringables = [
  { title: 'Chat commands', body: 'Triggers, responses, cooldowns, and permission levels — with legacy variable syntax converted automatically.' },
  { title: 'Viewer point balances', body: 'Your community keeps the points they’ve earned over the years. Balances merge safely and re-running never double-counts.' },
  { title: 'Tip & event history', body: 'Past tips, follows, subs, cheers, and raids backfill 12 months of your analytics dashboard.' },
  { title: 'Follower history', body: 'Recovered straight from Twitch, so your growth charts start full instead of empty.' },
];

export default function ImportPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="max-w-6xl mx-auto w-full flex items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center overflow-hidden">
            <img src="https://cdn.codeoce.com/logo/logo_white.png" alt="Creator Castle" className="w-full h-full object-contain p-1.5" />
          </span>
          <span className="text-base font-black tracking-tight text-white font-heading">Creator <span className="text-brand-primary">Castle</span></span>
        </Link>
        <Link href="/dashboard" className="saas-button !h-9 !px-5 !text-xs">Connect Twitch</Link>
      </nav>

      <header className="max-w-6xl mx-auto px-6 pt-16 md:pt-24 pb-16">
        <p className="text-sm font-bold text-brand-primary mb-5">Switching bots?</p>
        <h1 className="font-display font-black tracking-tight text-white leading-[0.95] text-[clamp(2.5rem,6vw,4.5rem)] max-w-3xl">
          Bring everything<br />with you.
        </h1>
        <p className="text-brand-muted text-lg font-medium mt-6 max-w-xl leading-relaxed">
          Commands, viewer points, tip history, analytics — imported in a few clicks.
          Your viewers keep what they earned, and your old setup stays untouched until you&rsquo;re ready.
        </p>
        <div className="flex items-center gap-6 mt-9">
          <Link href="/dashboard/integrations" className="saas-button">Start importing →</Link>
          <Link href="/docs/variables" className="text-sm font-semibold text-zinc-400 hover:text-white transition-colors">
            Variable compatibility
          </Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-14 border-t border-white/5">
        <h2 className="font-display font-black tracking-tight text-white text-2xl md:text-3xl mb-10">Three steps, one sitting.</h2>
        <div className="grid md:grid-cols-3 gap-10">
          {steps.map((s) => (
            <div key={s.n}>
              <span className="text-brand-primary font-black text-sm">{s.n}</span>
              <h3 className="text-white font-black tracking-tight text-lg mt-2">{s.title}</h3>
              <p className="text-zinc-400 font-medium leading-relaxed mt-2 text-sm">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-14 border-t border-white/5">
        <h2 className="font-display font-black tracking-tight text-white text-2xl md:text-3xl mb-3">What comes with you</h2>
        <p className="text-brand-muted font-medium max-w-xl mb-10">Every import is reviewable before it lands, and safe to re-run.</p>
        <div className="divide-y divide-white/5 border-y border-white/5">
          {bringables.map((f) => (
            <div key={f.title} className="grid md:grid-cols-[minmax(0,16rem)_1fr] gap-2 md:gap-10 py-6">
              <h3 className="font-black tracking-tight text-white">{f.title}</h3>
              <p className="text-zinc-400 font-medium leading-relaxed max-w-xl text-sm">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16 md:py-24 border-t border-white/5">
        <h2 className="font-display font-black tracking-tight text-white text-3xl md:text-4xl max-w-2xl leading-[0.98]">
          Your community shouldn&rsquo;t start from zero.
        </h2>
        <Link href="/dashboard/integrations" className="saas-button mt-8 inline-flex">Start importing →</Link>
      </section>
    </div>
  );
}

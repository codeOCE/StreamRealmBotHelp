import Link from 'next/link';

/* Hallmark · macrostructure: editorial spec-list (left-biased hero + divided feature rows)
 * genre: modern-minimal · tone: confident, streamer-native · anchor hue: Castle blue #3faaff
 * redesign: removed fake browser chrome, floating orbs, centred hero, 3-col icon-tile grid,
 * rainbow icons, eyebrow pills, glow CTA card. Single accent, asymmetric, typography-led.
 */

function FeatureIcon({ name }: { name: string }) {
  const p = { width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'terminal': return <svg {...p}><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>;
    case 'trophy':   return <svg {...p}><path d="M6 9H4.5a2.5 2.5 0 010-5H6" /><path d="M18 9h1.5a2.5 2.5 0 000-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0012 0V2z" /></svg>;
    case 'shield':   return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
    case 'layers':   return <svg {...p}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>;
    case 'zap':      return <svg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
    case 'clock':    return <svg {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    default:         return <svg {...p}><circle cx="12" cy="12" r="10" /></svg>;
  }
}

const features = [
  { icon: 'terminal', name: 'Commands', blurb: 'A custom command library with cooldowns, permission tiers, aliases, and multi-response pools.' },
  { icon: 'trophy', name: 'Loyalty & XP', blurb: 'Reward your regulars with XP, levels, and channel points. Set earn rates and multipliers per role.' },
  { icon: 'shield', name: 'Moderation', blurb: 'Auto-mod rules, spam filters, and word lists that keep chat clean without you watching it.' },
  { icon: 'layers', name: 'Overlays', blurb: 'Browser-source overlays for OBS, built in a drag-and-drop editor and updated in real time.' },
  { icon: 'zap', name: 'Interactions', blurb: 'Alerts, polls, bingo, wheel spins, and a points shop your viewers drive from chat.' },
  { icon: 'clock', name: 'Timers', blurb: 'Rotating chat messages on the intervals and conditions you set, so plugs run themselves.' },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav — wordmark left, single link + real CTA right */}
      <nav className="max-w-6xl mx-auto w-full flex items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center overflow-hidden">
            <img src="https://cdn.codeoce.com/logo/logo_white.png" alt="Creator Castle" className="w-full h-full object-contain p-1.5" />
          </span>
          <span className="text-base font-black tracking-tight text-white font-heading">Creator <span className="text-brand-primary">Castle</span></span>
        </Link>
        <div className="flex items-center gap-6">
          <a href="#features" className="text-sm font-semibold text-zinc-400 hover:text-white transition-colors">Features</a>
          <Link href="/dashboard" className="saas-button !h-9 !px-5 !text-xs">Connect Twitch</Link>
        </div>
      </nav>

      {/* Hero — left-biased, typography-led, no mockup */}
      <header className="max-w-6xl mx-auto px-6 pt-20 md:pt-28 pb-20 md:pb-28">
        <p className="text-sm font-bold text-brand-primary mb-5">For Twitch streamers</p>
        <h1 className="font-display font-black tracking-tight text-white leading-[0.95] text-[clamp(2.75rem,7vw,5rem)] max-w-3xl" style={{ overflowWrap: 'anywhere' }}>
          Run your whole stream<br />from one place.
        </h1>
        <p className="text-brand-muted text-lg font-medium mt-6 max-w-xl leading-relaxed">
          Commands, loyalty, overlays, moderation, and live alerts — the tools you&rsquo;d normally wire together
          from five different services, built into one fast dashboard.
        </p>
        <div className="flex items-center gap-6 mt-9">
          <Link href="/dashboard" className="saas-button">Connect Twitch →</Link>
          <a href="#features" className="text-sm font-semibold text-zinc-400 hover:text-white transition-colors">See what&rsquo;s inside</a>
        </div>
      </header>

      {/* Features — editorial spec list, divided rows, single accent, no cards */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-16 md:py-24 border-t border-white/5">
        <h2 className="font-display font-black tracking-tight text-white text-3xl md:text-4xl max-w-2xl mb-3">
          One dashboard instead of five tabs.
        </h2>
        <p className="text-brand-muted font-medium max-w-xl mb-12">Every tool your stream community needs, in one fast place.</p>

        <div className="divide-y divide-white/5 border-y border-white/5">
          {features.map((f) => (
            <div key={f.name} className="grid md:grid-cols-[minmax(0,16rem)_1fr] gap-2 md:gap-10 py-7">
              <div className="flex items-center gap-3 text-white">
                <span className="text-brand-primary"><FeatureIcon name={f.icon} /></span>
                <h3 className="font-black tracking-tight text-lg">{f.name}</h3>
              </div>
              <p className="text-zinc-400 font-medium leading-relaxed max-w-xl">{f.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Close — plain band, no glow card */}
      <section className="max-w-6xl mx-auto px-6 py-20 md:py-28 border-t border-white/5">
        <h2 className="font-display font-black tracking-tight text-white text-3xl md:text-5xl max-w-2xl leading-[0.98]">
          Set up your castle in a few minutes.
        </h2>
        <p className="text-brand-muted text-lg font-medium mt-5 max-w-lg leading-relaxed">
          Connect your Twitch account and your commands, loyalty system, and overlays are live the same session.
        </p>
        <Link href="/dashboard" className="saas-button mt-9 inline-flex">Connect Twitch →</Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-md bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center overflow-hidden">
              <img src="https://cdn.codeoce.com/logo/logo_white.png" alt="" className="w-full h-full object-contain p-1" />
            </span>
            <span className="text-sm font-bold text-zinc-500">Creator Castle</span>
          </div>
          <p className="text-sm text-zinc-600">
            &copy; 2026 Creator Castle &middot;{' '}
            <Link href="/import" className="hover:text-white transition-colors">Switching?</Link> &middot;{' '}
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link> &middot;{' '}
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link> &middot;{' '}
            <Link href="/status" className="hover:text-white transition-colors">Status</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

import type { Metadata } from 'next';
import { LayoutTemplate } from 'lucide-react';
import { DocHeader, DocSection, DocTable, Callout } from '@/components/docs/DocContent';

export const metadata: Metadata = {
  title: 'Overlays & Widgets | Creator Castle Docs',
  description: 'Building browser-source overlays with the visual editor and widget library.',
};

export default function OverlaysDocPage() {
  return (
    <div className="max-w-3xl space-y-12">
      <DocHeader
        icon={LayoutTemplate}
        kicker="Overlays"
        title="Overlays & widgets"
        description="An overlay is a page you add as a browser source in OBS (or any streaming software). Build it visually, then drop the URL in once."
      />

      <DocSection id="setup" title="Adding one to OBS">
        <p>
          Create an overlay from <strong className="text-zinc-200">Dashboard &gt; Overlays</strong>, arrange widgets in
          the visual editor, then copy its browser source URL into a Browser Source in OBS (or Streamlabs, vMix, etc.).
        </p>
      </DocSection>

      <DocSection id="widgets" title="Widget types">
        <DocTable
          head={['Widget', 'Purpose']}
          rows={[
            ['Text', 'Static or variable-driven text.'],
            ['Image', 'A static image or GIF.'],
            ['Chat', 'Live chat feed on stream.'],
            ['Alert', 'Pops up on follows, subs, cheers, raids, and tips.'],
            ['Goal', 'A live progress bar toward a follower/sub/donation target.'],
            ['Label', 'A small styled text badge (e.g. "!socials").'],
            ['Events', 'A scrolling feed of recent follows/subs/cheers/raids/tips.'],
            ['Goal Bar', 'Bundled, more configurable version of Goal with custom colors/fonts.'],
            ['Top Supporters', 'Leaderboard of your top tippers.'],
            ['Donation Ticker', 'Scrolling ticker of recent tips.'],
            ['Countdown', 'Countdown to a fixed date/time — starts, sub goals, etc.'],
            ['Emote Wall', 'Chat emotes float across the screen as they’re used.'],
            ['TCG Pack', 'Card-pack opening animation, shared with the Creator Castle TCG.'],
          ]}
        />
      </DocSection>

      <DocSection id="alerts" title="Alerts">
        <p>
          The Alert widget listens for real Twitch events via EventSub — follows, subs, cheers, and raids — and fires
          automatically, no polling or manual triggers needed. Configure a variant per event type in its properties
          panel.
        </p>
      </DocSection>

      <Callout tone="warn">
        Each overlay gets a unique, unguessable URL. Anyone with the link can <em>view</em> it, so don’t post it
        publicly — treat it like a password.
      </Callout>
    </div>
  );
}

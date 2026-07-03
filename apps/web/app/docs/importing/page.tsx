import type { Metadata } from 'next';
import Link from 'next/link';
import { Import } from 'lucide-react';
import { DocHeader, DocSection, DocTable, Code, Callout } from '@/components/docs/DocContent';

export const metadata: Metadata = {
  title: 'Importing from Nightbot & StreamElements | Creator Castle Docs',
  description: 'Bring your existing commands and timers over from another bot.',
};

export default function ImportingDocPage() {
  return (
    <div className="max-w-3xl space-y-12">
      <DocHeader
        icon={Import}
        kicker="Migrating"
        title="Importing from Nightbot & StreamElements"
        description="Switching bots doesn't mean starting over — bring your commands and timers with you."
      />

      <DocSection id="connect" title="Connecting">
        <p>From <strong className="text-zinc-200">Dashboard &gt; Integrations</strong>:</p>
        <DocTable
          head={['Bot', 'How to connect']}
          rows={[
            ['Nightbot', 'Sign in with Nightbot (OAuth) — no token to copy.'],
            ['StreamElements', 'Paste your StreamElements JWT token (found in your SE account settings).'],
          ]}
        />
      </DocSection>

      <DocSection id="import" title="What gets imported">
        <p>Commands (and Nightbot timers) are pulled in and converted to Creator Castle’s format automatically:</p>
        <DocTable
          head={['Field', 'Behavior']}
          rows={[
            ['Trigger', 'Kept as-is.'],
            ['Response', <span key="r">Legacy variable syntax (<Code>$(user)</Code>, <Code>{'{user}'}</Code>, etc.) is auto-converted — see{' '}
              <Link href="/docs/variables" className="text-brand-primary hover:underline">Variables</Link>.</span>],
            ['Permission level', 'Mapped to the closest Creator Castle level.'],
            ['Cooldown', 'Carried over 1:1.'],
            ['Duplicates', 'Skipped, never overwritten — safe to re-run an import.'],
          ]}
        />
      </DocSection>

      <Callout tone="warn">
        Nightbot has no points/loyalty system, so there’s nothing to import there — set up{' '}
        <Link href="/docs/loyalty" className="text-brand-primary hover:underline font-semibold">Loyalty & the Royal Shop</Link>{' '}
        fresh.
      </Callout>
    </div>
  );
}

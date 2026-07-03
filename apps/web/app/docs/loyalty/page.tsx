import type { Metadata } from 'next';
import { Crown } from 'lucide-react';
import { DocHeader, DocSection, DocTable, Code } from '@/components/docs/DocContent';

export const metadata: Metadata = {
  title: 'Loyalty & The Royal Shop | Creator Castle Docs',
  description: 'XP, levels, skills, and spending Points in the Royal Shop.',
};

export default function LoyaltyDocPage() {
  return (
    <div className="max-w-3xl space-y-12">
      <DocHeader
        icon={Crown}
        kicker="Engagement"
        title="Loyalty, XP & the Royal Shop"
        description="Viewers earn XP just by watching and chatting, level up, unlock skills, and spend Points in your castle-themed shop."
      />

      <DocSection id="xp" title="Earning XP">
        <p>Viewers passively gain XP for watchtime and chat activity. They can check their own progress or the channel leaderboard:</p>
        <DocTable
          head={['Command', 'What it shows']}
          rows={[
            [<Code key="1">!stats</Code>, 'Your XP, level, and watchtime.'],
            [<Code key="2">!xp</Code>, 'Alias for !stats.'],
            [<Code key="3">!top</Code>, 'The top XP leaderboard.'],
            [<Code key="4">!leaderboard</Code>, 'Alias for !top.'],
            [<Code key="5">!watchtime</Code>, 'Time spent watching this stream.'],
            [<Code key="6">!followage</Code>, 'How long they’ve followed the channel.'],
          ]}
        />
      </DocSection>

      <DocSection id="skills" title="Skills">
        <p>
          As viewers level up they can unlock skills — manage the available skill tree from{' '}
          <strong className="text-zinc-200">Dashboard &gt; Loyalty</strong>.
        </p>
      </DocSection>

      <DocSection id="shop" title="The Royal Shop">
        <p>
          Points are a separate currency viewers spend with <Code>!buy item</Code>. Purchases land in a redemption
          queue that you (or your mods) fulfill manually from <strong className="text-zinc-200">Dashboard &gt; Loyalty</strong> —
          nothing is auto-granted, so physical rewards, shoutouts, or custom perks all work the same way.
        </p>
      </DocSection>
    </div>
  );
}

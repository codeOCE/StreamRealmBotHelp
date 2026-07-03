import type { Metadata } from 'next';
import { Timer } from 'lucide-react';
import { DocHeader, DocSection, DocTable, Code, Callout } from '@/components/docs/DocContent';

export const metadata: Metadata = {
  title: 'Timers | Creator Castle Docs',
  description: 'Automatic, interval-based chat messages that respect chat activity.',
};

export default function TimersDocPage() {
  return (
    <div className="max-w-3xl space-y-12">
      <DocHeader
        icon={Timer}
        kicker="Engagement"
        title="Timers"
        description="Timers post a message to chat on a repeating interval — for socials, sponsors, or reminders — without you lifting a finger."
      />

      <DocSection id="fields" title="How a timer is configured">
        <p>Manage timers from <strong className="text-zinc-200">Dashboard &gt; Timers</strong>.</p>
        <DocTable
          head={['Field', 'What it does']}
          rows={[
            ['Message', <span key="m">The text sent to chat. Supports <Code>variables</Code>.</span>],
            ['Interval', 'How often it can fire, in seconds. 60s minimum.'],
            ['Chat lines', 'Minimum chat messages needed since the last fire before it fires again.'],
            ['Enabled', 'Turn a timer on or off without deleting it.'],
          ]}
        />
      </DocSection>

      <DocSection id="behavior" title="Behavior">
        <p>
          The interval is a maximum frequency, not a guarantee — a timer only actually sends once chat has produced
          at least its <Code>chat lines</Code> count since the last time it fired. That count resets every time the
          timer fires, so a quiet chat just makes it wait longer instead of spamming a dead room.
        </p>
        <p>Timers only run while your channel is connected and the bot is live in your chat.</p>
      </DocSection>

      <Callout>
        Set <Code>chat lines</Code> to <Code>0</Code> if you want a timer to fire strictly on the interval regardless
        of chat activity.
      </Callout>
    </div>
  );
}

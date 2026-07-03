import type { Metadata } from 'next';
import Link from 'next/link';
import { Terminal } from 'lucide-react';
import { DocHeader, DocSection, DocTable, Code, Callout } from '@/components/docs/DocContent';

export const metadata: Metadata = {
  title: 'Commands | Creator Castle Docs',
  description: 'Built-in commands, custom commands, permission levels, and cooldowns.',
};

const BUILT_INS: Record<string, [string, string, string][]> = {
  Streaming: [
    ['!uptime', 'Shows how long the stream has been live.', 'Viewer'],
    ['!game', 'Shows the current game being played.', 'Viewer'],
    ['!title', 'Shows the current stream title.', 'Viewer'],
  ],
  Loyalty: [
    ['!stats / !xp', 'Shows your XP, level, and watchtime.', 'Viewer'],
    ['!top / !leaderboard', 'Shows the top XP leaderboard.', 'Viewer'],
    ['!watchtime', 'Shows how much time you’ve spent in the stream.', 'Viewer'],
    ['!followage', 'Shows how long you’ve followed the channel.', 'Viewer'],
  ],
  Utility: [
    ['!commands / !help', 'Lists all available commands.', 'Viewer'],
    ['!ping', 'Checks if the bot is online.', 'Viewer'],
    ['!socials', 'Displays links to social media profiles.', 'Viewer'],
  ],
  Moderation: [
    ['!shoutout / !so', 'Gives a shoutout to another streamer.', 'Moderator'],
    ['!addcom', 'Adds a new custom command from chat.', 'Moderator'],
    ['!editcom', 'Edits an existing custom command from chat.', 'Moderator'],
    ['!delcom', 'Deletes a custom command from chat.', 'Moderator'],
    ['!permit', 'Lets a user post one link, bypassing the Links rule for ~2 minutes.', 'Moderator'],
  ],
};

export default function CommandsDocPage() {
  return (
    <div className="max-w-3xl space-y-12">
      <DocHeader
        icon={Terminal}
        kicker="Chat commands"
        title="Commands"
        description="Every command runs with a ! prefix in chat. Creator Castle ships a set of built-ins and lets you add unlimited custom commands."
      />

      <DocSection id="built-in" title="Built-in commands">
        <p>These exist for every channel out of the box. You can disable any of them from the dashboard, but not delete them.</p>
        {Object.entries(BUILT_INS).map(([category, rows]) => (
          <div key={category} className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600">{category}</h3>
            <DocTable
              head={['Command', 'Description', 'Min. level']}
              rows={rows.map(([cmd, desc, level]) => [<Code key={cmd}>{cmd}</Code>, desc, level])}
            />
          </div>
        ))}
      </DocSection>

      <DocSection id="custom" title="Custom commands">
        <p>
          Add custom commands from <strong className="text-zinc-200">Dashboard &gt; Commands</strong>, or on the fly in
          chat with <Code>!addcom !trigger response text</Code> (moderator+). Each command has:
        </p>
        <DocTable
          head={['Field', 'What it does']}
          rows={[
            ['Trigger', 'The word after ! that runs the command. Case-insensitive.'],
            ['Response(s)', 'The message the bot sends. Add several and one is picked at random each run.'],
            ['Aliases', 'Extra triggers that point at the same command.'],
            ['Cooldown', 'Global seconds before anyone can trigger it again.'],
            ['User cooldown', 'Seconds before the same user can trigger it again.'],
            ['Permission level', 'Minimum level required to run it — see below.'],
            ['Regex', 'Optional — match the trigger as a regular expression instead of an exact word.'],
          ]}
        />
        <p>
          Responses support <Link href="/docs/variables" className="text-brand-primary hover:underline">variables</Link>{' '}
          like <Code>$(user)</Code> and <Code>$(channel)</Code> for dynamic text.
        </p>
      </DocSection>

      <DocSection id="permissions" title="Permission levels">
        <p>From lowest to highest — the broadcaster and moderators can always run any command regardless of its set level.</p>
        <DocTable
          head={['Level', 'Who']}
          rows={[
            ['Viewer', 'Anyone in chat.'],
            ['Subscriber', 'Active subscribers to the channel.'],
            ['VIP', 'Users with the VIP badge.'],
            ['Moderator', 'Channel moderators.'],
            ['Broadcaster', 'The channel owner only.'],
          ]}
        />
      </DocSection>

      <Callout>
        Migrating from Nightbot or StreamElements? See{' '}
        <Link href="/docs/importing" className="text-brand-primary hover:underline font-semibold">Importing commands</Link>{' '}
        — existing triggers are skipped, not overwritten, so it’s safe to run more than once.
      </Callout>
    </div>
  );
}

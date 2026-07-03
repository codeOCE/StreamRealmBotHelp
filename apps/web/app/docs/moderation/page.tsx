import type { Metadata } from 'next';
import { ShieldAlert } from 'lucide-react';
import { DocHeader, DocSection, DocTable, Code, Callout } from '@/components/docs/DocContent';

export const metadata: Metadata = {
  title: 'Moderation | Creator Castle Docs',
  description: 'Sentinel auto-mod rules, actions, and bypasses.',
};

export default function ModerationDocPage() {
  return (
    <div className="max-w-3xl space-y-12">
      <DocHeader
        icon={ShieldAlert}
        kicker="Moderation"
        title="Sentinel — auto-mod"
        description="Sentinel checks every chat message against your mod rules before it's allowed to stand, and logs every action it takes."
      />

      <DocSection id="bypass" title="Who bypasses it">
        <p>
          The broadcaster and moderators always bypass every rule. To let a specific viewer post one link without
          triggering the Links rule, a moderator can run <Code>!permit username</Code> — that grants a ~2 minute
          window for that one message.
        </p>
      </DocSection>

      <DocSection id="rule-types" title="Rule types">
        <DocTable
          head={['Type', 'Checks for']}
          rows={[
            ['CAPS', 'Percentage of the message in uppercase letters exceeding a threshold.'],
            ['LINKS', 'Any http(s):// URL in the message.'],
            ['SPAM', 'Repeated words — low unique-word ratio across a message.'],
            ['SYMBOLS', 'Percentage of non-alphanumeric characters exceeding a threshold.'],
            ['EMOTES', 'Ratio of emote-like (all-caps, 3+ letter) words exceeding a threshold.'],
            ['BANNED_WORDS', 'A configurable word/phrase blocklist.'],
          ]}
        />
      </DocSection>

      <DocSection id="settings" title="Per-rule settings">
        <DocTable
          head={['Setting', 'What it does']}
          rows={[
            ['threshold', 'Sensitivity for CAPS/SPAM/SYMBOLS/EMOTES, 0–1. Default 0.7.'],
            ['minLength', 'Skip the check entirely for messages shorter than this.'],
            ['bypassLevel', 'Permission level (e.g. Subscriber) that skips this rule.'],
            ['action', <span key="a"><Code>DELETE</Code>, <Code>TIMEOUT</Code>, <Code>BAN</Code>, or <Code>WARN</Code>.</span>],
            ['duration', 'Timeout length in seconds, when action is TIMEOUT.'],
            ['silent', 'Suppress the chat warning message when the rule fires.'],
            ['customMsg', 'Override the default warning text — supports variables.'],
          ]}
        />
      </DocSection>

      <Callout>
        Every action Sentinel takes — deletes, timeouts, bans, warnings — is written to the audit log so you can review
        what happened and why.
      </Callout>
    </div>
  );
}

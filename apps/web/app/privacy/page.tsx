// ponytail: real starter policy grounded in what the app does. Have counsel
// review the bracketed bits before launch — don't ship legal text unread.

export const metadata = { title: 'Privacy Policy · CreatorCastle' };

const UPDATED = 'June 26, 2026';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black text-zinc-300 px-6 py-16">
      <article className="max-w-2xl mx-auto space-y-6 leading-relaxed">
        <h1 className="text-3xl font-black text-white">Privacy Policy</h1>
        <p className="text-sm text-zinc-500">Last updated {UPDATED}</p>

        <h2 className="text-xl font-bold text-white pt-4">What we collect</h2>
        <p>When you connect with Twitch, we receive your Twitch user ID, login, display name, and avatar. We store an encrypted copy of the Twitch OAuth tokens needed to run your bot and overlays. For your viewers, we store Twitch IDs and chat-derived data (loyalty points, watchtime, command usage) so the features you enable can work.</p>

        <h2 className="text-xl font-bold text-white pt-4">How we use it</h2>
        <p>Solely to provide the service: running your chat bot, rendering overlays, tracking loyalty, processing tips, and showing your dashboard analytics. We do not sell your data or your viewers&apos; data.</p>

        <h2 className="text-xl font-bold text-white pt-4">Where it lives</h2>
        <p>Data is stored in our database (Supabase/PostgreSQL). OAuth tokens are encrypted at rest (AES-GCM). Payment processing for tips is handled by Stripe; we never store card numbers.</p>

        <h2 className="text-xl font-bold text-white pt-4">Your rights &amp; data deletion</h2>
        <p>You can disconnect at any time, which revokes our access tokens. To delete your account and associated data, email <a className="text-violet-400 underline" href="mailto:[privacy@creatorcastle.gg]">[privacy@creatorcastle.gg]</a> and we will remove it within 30 days. EU/UK users may exercise GDPR rights (access, rectification, erasure, portability) via the same address.</p>

        <h2 className="text-xl font-bold text-white pt-4">Contact</h2>
        <p>Questions: <a className="text-violet-400 underline" href="mailto:[privacy@creatorcastle.gg]">[privacy@creatorcastle.gg]</a>.</p>
      </article>
    </main>
  );
}

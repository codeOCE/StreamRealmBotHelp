// ponytail: starter ToS. Counsel reviews the bracketed bits before launch.

export const metadata = { title: 'Terms of Service · CreatorCastle' };

const UPDATED = 'June 26, 2026';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black text-zinc-300 px-6 py-16">
      <article className="max-w-2xl mx-auto space-y-6 leading-relaxed">
        <h1 className="text-3xl font-black text-white">Terms of Service</h1>
        <p className="text-sm text-zinc-500">Last updated {UPDATED}</p>

        <h2 className="text-xl font-bold text-white pt-4">Using CreatorCastle</h2>
        <p>CreatorCastle provides chat-bot, overlay, loyalty, and monetization tools for streamers. By connecting your account you agree to these terms and to Twitch&apos;s own Terms of Service and Developer Agreement.</p>

        <h2 className="text-xl font-bold text-white pt-4">Your responsibilities</h2>
        <p>You are responsible for how you configure the bot and what it posts in your chat, including compliance with Twitch&apos;s Community Guidelines. Don&apos;t use the service to harass, spam, or break the law. We may suspend accounts that do.</p>

        <h2 className="text-xl font-bold text-white pt-4">Tips &amp; payments</h2>
        <p>Tips are processed by Stripe. Payouts, fees, refunds, and chargebacks are subject to Stripe&apos;s terms and [our payout policy]. CreatorCastle is not a party to the gift between a viewer and a creator beyond facilitating the transaction.</p>

        <h2 className="text-xl font-bold text-white pt-4">Availability</h2>
        <p>We work to keep the service reliable but provide it &quot;as is,&quot; without warranty. Live status is at <a className="text-violet-400 underline" href="/status">/status</a>. To the extent permitted by law, our liability is limited to [the amount you paid us in the prior 12 months].</p>

        <h2 className="text-xl font-bold text-white pt-4">Changes &amp; termination</h2>
        <p>We may update these terms; material changes will be noted on this page. You can stop using the service and disconnect at any time. See our <a className="text-violet-400 underline" href="/privacy">Privacy Policy</a> for data handling.</p>

        <h2 className="text-xl font-bold text-white pt-4">Contact</h2>
        <p><a className="text-violet-400 underline" href="mailto:[support@creatorcastle.gg]">[support@creatorcastle.gg]</a></p>
      </article>
    </main>
  );
}

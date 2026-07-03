// ponytail: hand-maintained list. Wire to git tags / a CMS only if updating it
// by hand ever becomes the bottleneck (it won't for a while).

export const metadata = { title: 'Changelog · CreatorCastle' };

const ENTRIES: { date: string; items: string[] }[] = [
  {
    date: 'June 26, 2026',
    items: [
      'Analytics (Intel) and moderation log (Sentinel) now powered by live data.',
      'Faster command imports and bingo round resets for large channels.',
      'Hardened authentication and added operational error alerting.',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <main className="min-h-screen bg-black text-zinc-300 px-6 py-16">
      <article className="max-w-2xl mx-auto space-y-10">
        <h1 className="text-3xl font-black text-white">Changelog</h1>
        {ENTRIES.map((e) => (
          <section key={e.date} className="space-y-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-violet-400">{e.date}</h2>
            <ul className="list-disc list-inside space-y-1.5 leading-relaxed">
              {e.items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          </section>
        ))}
      </article>
    </main>
  );
}

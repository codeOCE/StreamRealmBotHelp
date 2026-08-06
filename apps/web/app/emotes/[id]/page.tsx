import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checker, fetchEmote, isVaultHost } from "@/lib/vault";
import { VaultChrome } from "@/components/vault-chrome";
import { CopyLinkButton } from "@/components/copy-link-button";
import { AddEmoteButton } from "@/components/add-emote-button";

// Only reachable on emotes.creatorcastle.gg — app.creatorcastle.gg 404s here
// rather than serving the same content twice under two hosts (bad for SEO).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  if (!(await isVaultHost())) return {};
  const { id } = await params;
  const data = await fetchEmote(id);
  if (!data) return {};
  const { emote } = data;
  const title = `${emote.code} Emote`;
  const description = `${emote.code} is a free ${emote.animated ? "animated" : "static"} Twitch emote${
    emote.owner ? ` from ${emote.owner}` : ""
  } on Creator Castle. Download or add it to your channel.`;
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: emote.imageUrl }] },
    twitter: { card: "summary", title, description, images: [emote.imageUrl] },
  };
}

export default async function EmoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isVaultHost())) notFound();

  const { id } = await params;
  const data = await fetchEmote(id);
  if (!data) notFound();
  const { emote, related } = data;

  // ImageObject markup — this is what makes an emote page eligible for image
  // and rich results, which is the point of the whole subdomain.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    name: `${emote.code} emote`,
    description: `${emote.code}, a free ${emote.animated ? "animated" : "static"} Twitch emote on Creator Castle.`,
    contentUrl: emote.imageUrl,
    thumbnailUrl: emote.imageUrl,
    uploadDate: emote.createdAt,
    encodingFormat: emote.animated ? "image/gif" : "image/webp",
    license: "https://emotes.creatorcastle.gg/terms",
    acquireLicensePage: `https://emotes.creatorcastle.gg/emotes/${emote.id}`,
    ...(emote.owner ? { creator: { "@type": "Person", name: emote.owner } } : {}),
    ...(emote.tags.length ? { keywords: emote.tags.join(", ") } : {}),
  };

  return (
    <VaultChrome>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-4xl mx-auto space-y-8">
        <Link href="/" className="text-xs font-black uppercase tracking-wide text-zinc-500 hover:text-white transition-colors">
          ← Back to the Vault
        </Link>

        <div className="grid md:grid-cols-[22rem_1fr] gap-6">
          {/* ── Preview panel — big, like 7TV/BTTV's emote page ─────── */}
          <div className="space-y-4">
            <div className="glass-card rounded-3xl border border-white/10 overflow-hidden">
              <div className="aspect-square flex items-center justify-center p-10 relative" style={checker}>
                <img src={emote.imageUrl} alt={`${emote.code} emote`} className="max-w-full max-h-full object-contain drop-shadow-2xl" />
                {emote.animated && (
                  <span className="absolute top-3 left-3 text-[10px] font-black uppercase px-2 py-1 rounded bg-black/70 text-amber-300 border border-amber-400/20">
                    Animated
                  </span>
                )}
              </div>
            </div>

            {/* Size ramp — 7TV shows the emote at every render size ── */}
            <div className="flex items-end justify-center gap-3">
              {[
                { h: 32, label: "1×" },
                { h: 64, label: "2×" },
                { h: 96, label: "3×" },
                { h: 128, label: "4×" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-1.5">
                  <div className="flex items-center justify-center rounded-lg border border-white/5 p-2" style={{ ...checker, height: s.h + 16, width: s.h + 16 }}>
                    <img src={emote.imageUrl} alt="" style={{ height: s.h, maxWidth: s.h }} className="object-contain" />
                  </div>
                  <span className="text-[9px] font-black uppercase text-zinc-600">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Meta panel ───────────────────────────────────────────── */}
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-black text-white font-heading">
                <code>{emote.code}</code>
              </h1>
              <p className="text-sm text-zinc-500 mt-1">
                added {new Date(emote.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </p>
            </div>

            {/* Uploader — avatar + link to their public profile */}
            {emote.owner && (
              <div className="flex items-center gap-3">
                {emote.ownerAvatar && (
                  <img src={emote.ownerAvatar} alt="" className="w-10 h-10 rounded-full border border-white/10 object-cover" />
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wide text-zinc-600">Uploaded by</p>
                  {emote.ownerHandle ? (
                    <Link href={`/user/${emote.ownerHandle}`} className="text-sm font-black text-white hover:text-brand-primary transition-colors">
                      {emote.owner}
                    </Link>
                  ) : (
                    <p className="text-sm font-black text-white">{emote.owner}</p>
                  )}
                </div>
              </div>
            )}

            {/* Usage — the BTTV/7TV popularity signal */}
            <div className="glass-card rounded-xl border border-white/5 px-4 py-3 inline-flex items-center gap-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-primary"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>
              <span className="text-sm font-black text-white tabular-nums">{emote.channels}</span>
              <span className="text-xs font-semibold text-zinc-500">
                {emote.channels === 1 ? "channel uses this" : "channels use this"}
              </span>
            </div>

            {emote.tags.length > 0 && (
              <div>
                <h2 className="text-xs font-black uppercase tracking-wide text-zinc-400 mb-2">Tags</h2>
                <div className="flex flex-wrap gap-1.5">
                {emote.tags.map((t) => (
                  <Link key={t} href={`/?tag=${encodeURIComponent(t)}`} className="text-[10px] font-bold px-2 py-1 rounded bg-white/5 text-zinc-400 hover:text-white transition-colors">
                    #{t}
                  </Link>
                ))}
                </div>
              </div>
            )}

            <p className="text-sm text-zinc-400">
              Type <code className="text-brand-primary">{emote.code}</code> in chat to use this emote — viewers need the{" "}
              <a href="https://app.creatorcastle.gg" className="text-brand-primary hover:underline">
                Creator Castle browser extension
              </a>{" "}
              to see it render.
            </p>

            <div className="flex items-center gap-3 flex-wrap">
              <AddEmoteButton id={emote.id} />
              <CopyLinkButton url={emote.imageUrl} />
            </div>
          </div>
        </div>

        {/* ── Related emotes — 7TV's "similar" row ─────────────────── */}
        {related.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-white/5">
            <h2 className="text-sm font-black uppercase tracking-wide text-zinc-400">Similar emotes</h2>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/emotes/${r.id}`}
                  className="group glass-card rounded-xl border border-white/5 hover:border-brand-primary/40 transition-colors overflow-hidden"
                >
                  <div className="h-20 flex items-center justify-center overflow-hidden" style={checker}>
                    <img src={r.imageUrl} alt={r.code} loading="lazy" style={{ height: Math.min(56, r.width) }} className="object-contain transition-transform duration-200 group-hover:scale-125" />
                  </div>
                  <div className="px-2 py-1.5 border-t border-white/5">
                    <code className="text-[11px] font-black text-white truncate block">{r.code}</code>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </VaultChrome>
  );
}

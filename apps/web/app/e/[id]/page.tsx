import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checker, fetchEmote, isVaultHost } from "@/lib/vault";
import { VaultChrome } from "@/components/vault-chrome";
import { CopyLinkButton } from "@/components/copy-link-button";

// Only reachable on emotes.creatorcastle.gg — app.creatorcastle.gg 404s here
// rather than serving the same content twice under two hosts (bad for SEO).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  if (!(await isVaultHost())) return {};
  const { id } = await params;
  const emote = await fetchEmote(id);
  if (!emote) return {};
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
  const emote = await fetchEmote(id);
  if (!emote) notFound();

  return (
    <VaultChrome>
      <div className="max-w-4xl mx-auto space-y-6">
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
                {emote.owner && <>by {emote.owner} · </>}
                added {new Date(emote.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </p>
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
              <a href="https://app.creatorcastle.gg/dashboard/emotes" className="saas-button inline-block">
                Add to my channel →
              </a>
              <CopyLinkButton url={emote.imageUrl} />
            </div>
          </div>
        </div>
      </div>
    </VaultChrome>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checker, fetchEmote } from "../../lib";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
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
  const { id } = await params;
  const emote = await fetchEmote(id);
  if (!emote) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <Link href="/" className="text-xs font-black uppercase tracking-wide text-zinc-500 hover:text-white transition-colors">
        ← Back to the Vault
      </Link>

      <div className="glass-card rounded-[2rem] border border-white/10 overflow-hidden">
        <div className="flex items-center justify-center py-16" style={checker}>
          <img src={emote.imageUrl} alt={`${emote.code} emote`} style={{ height: Math.min(160, emote.width * 4) }} className="object-contain" />
        </div>
        <div className="p-7 space-y-4 border-t border-white/5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-black text-white font-heading">
                <code>{emote.code}</code>
              </h1>
              {emote.owner && <p className="text-sm text-zinc-500 mt-1">by {emote.owner}</p>}
            </div>
            {emote.animated && (
              <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-black/60 text-amber-300 border border-amber-400/20">
                Animated
              </span>
            )}
          </div>

          {emote.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {emote.tags.map((t) => (
                <Link key={t} href={`/?tag=${encodeURIComponent(t)}`} className="text-[10px] font-bold px-2 py-1 rounded bg-white/5 text-zinc-400 hover:text-white transition-colors">
                  #{t}
                </Link>
              ))}
            </div>
          )}

          <p className="text-sm text-zinc-400">
            Type <code className="text-brand-primary">{emote.code}</code> in chat to use this emote — viewers need the{" "}
            <a href="https://app.creatorcastle.gg" className="text-brand-primary hover:underline">
              Creator Castle browser extension
            </a>{" "}
            to see it render.
          </p>

          <a
            href="https://app.creatorcastle.gg/dashboard/emotes"
            className="saas-button inline-block"
          >
            Add to my channel →
          </a>
        </div>
      </div>
    </div>
  );
}

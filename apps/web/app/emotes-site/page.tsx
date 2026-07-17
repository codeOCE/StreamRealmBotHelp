import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { checker, fetchDirectory } from "./lib";

const PAGE_SIZE = 48;

type SearchParams = { q?: string; tag?: string; animated?: string; page?: string };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  if (!q) return {};
  return {
    title: `“${q}” emotes`,
    description: `Free "${q}" Twitch emotes shared by Creator Castle streamers.`,
  };
}

export default async function VaultBrowsePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);

  const params = new URLSearchParams();
  if (sp.q) params.set("q", sp.q);
  if (sp.tag) params.set("tag", sp.tag);
  if (sp.animated) params.set("animated", sp.animated);
  params.set("page", String(page));

  const { emotes, total } = await fetchDirectory(params);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params);
    p.delete("page");
    for (const [k, v] of Object.entries(overrides)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };
  const pageHref = (n: number) => {
    const p = new URLSearchParams(params);
    p.set("page", String(n));
    return `/?${p}`;
  };

  const filterTab = (label: string, active: boolean, href: string) => (
    <Link
      key={label}
      href={href}
      className={cn(
        "px-4 py-2 rounded-xl text-xs font-black border transition-colors",
        active ? "bg-brand-primary text-white border-brand-primary" : "bg-white/[0.02] text-zinc-500 border-white/10 hover:text-white",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white font-heading">
          {sp.q ? `Emotes matching “${sp.q}”` : "The Emote Vault"}
        </h1>
        <p className="text-brand-muted text-sm font-medium mt-1 max-w-2xl">
          Free custom Twitch emotes shared by Creator Castle streamers — grab the{" "}
          <a href="https://app.creatorcastle.gg" className="text-brand-primary hover:underline">
            browser extension
          </a>{" "}
          to see these render live in chat.
        </p>
      </div>

      <form action="/" method="get" className="flex gap-2 flex-wrap">
        <input
          type="text"
          name="q"
          defaultValue={sp.q}
          placeholder="Search emotes…"
          className="flex-1 min-w-[12rem] bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-brand-primary/50"
        />
        <input
          type="text"
          name="tag"
          defaultValue={sp.tag}
          placeholder="Tag…"
          className="w-32 bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-brand-primary/50"
        />
        <button type="submit" className="saas-button">
          Search
        </button>
      </form>

      <div className="flex gap-2 flex-wrap">
        {filterTab("All", !sp.animated, qs({ animated: undefined }))}
        {filterTab("Animated", sp.animated === "true", qs({ animated: "true" }))}
        {filterTab("Static", sp.animated === "false", qs({ animated: "false" }))}
      </div>

      {emotes.length === 0 ? (
        <div className="py-24 flex flex-col items-center gap-3 text-center">
          <div className="text-4xl opacity-30">🗝️</div>
          <p className="text-zinc-600 text-sm font-semibold">No emotes match those filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
          {emotes.map((e) => (
            <Link
              key={e.id}
              href={`/e/${e.id}`}
              className="group relative glass-card rounded-2xl border border-white/5 hover:border-brand-primary/40 transition-colors overflow-hidden"
            >
              <div className="relative h-24 flex items-center justify-center overflow-hidden" style={checker}>
                <img
                  src={e.imageUrl}
                  alt={`${e.code} emote`}
                  loading="lazy"
                  style={{ height: Math.min(64, e.width) }}
                  className="object-contain transition-transform duration-200 ease-out group-hover:scale-[1.65]"
                />
                {e.animated && (
                  <span className="absolute top-1.5 left-1.5 text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-black/60 text-amber-300 border border-amber-400/20">
                    GIF
                  </span>
                )}
              </div>
              <div className="px-3 py-2 border-t border-white/5">
                <code className="text-xs font-black text-white truncate block">{e.code}</code>
                {e.owner && <p className="text-[10px] text-zinc-600 truncate mt-0.5">{e.owner}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="saas-button-secondary text-xs">
              ← Previous
            </Link>
          )}
          <span className="text-xs font-black text-zinc-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="saas-button-secondary text-xs">
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

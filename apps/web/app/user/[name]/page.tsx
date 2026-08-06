import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checker, fetchUserProfile, isVaultHost } from "@/lib/vault";
import { VaultChrome } from "@/components/vault-chrome";

// Public creator profile — vault-host only (404 on app.creatorcastle.gg), and
// server-rendered so each creator's emote set is its own indexable page.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  if (!(await isVaultHost())) return {};
  const { name } = await params;
  const data = await fetchUserProfile(name);
  if (!data) return {};
  const title = `${data.user.name}'s Emotes`;
  const description = `Browse the ${data.user.count} free custom Twitch emotes shared by ${data.user.name} on Creator Castle.`;
  return {
    title,
    description,
    openGraph: { title, description, images: data.user.avatar ? [{ url: data.user.avatar }] : undefined },
  };
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  if (!(await isVaultHost())) notFound();

  const { name } = await params;
  const data = await fetchUserProfile(name);
  if (!data) notFound();
  const { user, emotes } = data;

  return (
    <VaultChrome>
      <div className="space-y-8">
        <Link href="/" className="text-xs font-black uppercase tracking-wide text-zinc-500 hover:text-white transition-colors">
          ← Back to the Vault
        </Link>

        {/* Profile header */}
        <div className="flex items-center gap-5 flex-wrap">
          <img
            src={user.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=guest"}
            alt={user.name}
            className="w-20 h-20 rounded-2xl border border-white/10 object-cover"
            style={{ boxShadow: "0 0 40px rgba(63,170,255,0.12)" }}
          />
          <div className="min-w-0">
            <h1 className="text-3xl font-black tracking-tight text-white font-heading">{user.name}</h1>
            <p className="text-brand-muted text-sm font-medium mt-1">
              <span className="text-white font-black tabular-nums">{user.count}</span>{" "}
              {user.count === 1 ? "emote" : "emotes"} shared to the vault
            </p>
          </div>
        </div>

        {emotes.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-3 text-center">
            <div className="text-4xl opacity-30">🗝️</div>
            <p className="text-zinc-600 text-sm font-semibold">{user.name} hasn&rsquo;t shared any emotes yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
            {emotes.map((e) => (
              <Link
                key={e.id}
                href={`/emotes/${e.id}`}
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
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </VaultChrome>
  );
}

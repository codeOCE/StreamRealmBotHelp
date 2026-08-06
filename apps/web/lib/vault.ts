import { headers } from "next/headers";
import { getWorkerOrigin } from "@/lib/api";
import type { VaultEmote, VaultEmoteDetail, VaultProfile } from "@/lib/vault-shared";

// Re-export the client-safe bits so existing `@/lib/vault` imports keep working.
export { checker } from "@/lib/vault-shared";
export type { VaultEmote, VaultEmoteDetail, VaultProfile } from "@/lib/vault-shared";

/**
 * emotes.creatorcastle.gg and app.creatorcastle.gg are the SAME Next.js deploy
 * (one worker, one wrangler route per custom domain) — there's no edge-runtime
 * middleware/proxy support on OpenNext-Cloudflare in Next 16, so routes that
 * need to behave differently per host check it directly via the Host header.
 */
export async function isVaultHost(): Promise<boolean> {
  const h = await headers();
  return (h.get("host") || "").startsWith("emotes.");
}

export async function fetchDirectory(
  params: URLSearchParams,
): Promise<{ emotes: VaultEmote[]; total: number }> {
  const res = await fetch(`${getWorkerOrigin()}/api/emotes/public/directory?${params}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return { emotes: [], total: 0 };
  return res.json();
}

/** Emote detail + the related-emotes row (7TV shows similar emotes by tag). */
export async function fetchEmote(
  id: string,
): Promise<{ emote: VaultEmoteDetail; related: VaultEmote[] } | null> {
  const res = await fetch(`${getWorkerOrigin()}/api/emotes/public/emote/${encodeURIComponent(id)}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  if (!j?.emote) return null;
  return { emote: j.emote as VaultEmoteDetail, related: (j.related ?? []) as VaultEmote[] };
}

/** A creator's public vault profile — their shared emotes. */
export async function fetchUserProfile(
  name: string,
): Promise<{ user: VaultProfile; emotes: VaultEmote[] } | null> {
  const res = await fetch(`${getWorkerOrigin()}/api/emotes/public/user/${encodeURIComponent(name)}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  if (!j?.user) return null;
  return { user: j.user as VaultProfile, emotes: (j.emotes ?? []) as VaultEmote[] };
}

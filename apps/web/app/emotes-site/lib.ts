import { getWorkerOrigin } from "@/lib/api";

export interface VaultEmote {
  id: string;
  code: string;
  imageUrl: string;
  width: number;
  animated: boolean;
  zeroWidth: boolean;
  tags: string[];
  owner: string | null;
  createdAt: string;
}

/** Transparency checkerboard behind emotes — matches the dashboard's emote tiles. */
export const checker: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg,#ffffff0a 25%,transparent 25%,transparent 75%,#ffffff0a 75%),linear-gradient(45deg,#ffffff0a 25%,transparent 25%,transparent 75%,#ffffff0a 75%)",
  backgroundSize: "14px 14px",
  backgroundPosition: "0 0,7px 7px",
};

export async function fetchDirectory(
  params: URLSearchParams,
): Promise<{ emotes: VaultEmote[]; total: number }> {
  const res = await fetch(`${getWorkerOrigin()}/api/emotes/public/directory?${params}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return { emotes: [], total: 0 };
  return res.json();
}

export async function fetchEmote(id: string): Promise<VaultEmote | null> {
  const res = await fetch(`${getWorkerOrigin()}/api/emotes/public/emote/${encodeURIComponent(id)}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  return (j?.emote as VaultEmote) ?? null;
}

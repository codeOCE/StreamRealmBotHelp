/** Client-safe vault bits — no `next/headers`, so client components can import these. */

export interface VaultEmote {
  id: string;
  code: string;
  imageUrl: string;
  width: number;
  animated: boolean;
  zeroWidth: boolean;
  tags: string[];
  owner: string | null;
  ownerAvatar: string | null;
  /** How many channels have added this emote (powers Top/Trending + the stat). */
  channels: number;
  createdAt: string;
}

/** Detail-page emote also carries the owner's handle, for their profile link. */
export interface VaultEmoteDetail extends VaultEmote {
  ownerHandle: string | null;
}

export interface VaultProfile {
  name: string;
  handle: string;
  avatar: string | null;
  count: number;
}

/** Sort modes offered by the vault browser (mirrors 7TV's Top/Trending/New). */
export const VAULT_SORTS = ["top", "trending", "new", "name"] as const;
export type VaultSort = (typeof VAULT_SORTS)[number];
export const DEFAULT_VAULT_SORT: VaultSort = "top";

/** Transparency checkerboard behind emotes — matches the dashboard's emote tiles. */
export const checker: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg,#ffffff0a 25%,transparent 25%,transparent 75%,#ffffff0a 75%),linear-gradient(45deg,#ffffff0a 25%,transparent 25%,transparent 75%,#ffffff0a 75%)",
  backgroundSize: "14px 14px",
  backgroundPosition: "0 0,7px 7px",
};

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
  createdAt: string;
}

/** Transparency checkerboard behind emotes — matches the dashboard's emote tiles. */
export const checker: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg,#ffffff0a 25%,transparent 25%,transparent 75%,#ffffff0a 75%),linear-gradient(45deg,#ffffff0a 25%,transparent 25%,transparent 75%,#ffffff0a 75%)",
  backgroundSize: "14px 14px",
  backgroundPosition: "0 0,7px 7px",
};

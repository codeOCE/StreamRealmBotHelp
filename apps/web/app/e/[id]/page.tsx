import { permanentRedirect } from "next/navigation";

/**
 * Legacy emote URL. The vault moved to 7TV's shape (/emotes/:id); this 308s so
 * any link already in the wild keeps working and passes its ranking along.
 */
export default async function LegacyEmoteRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/emotes/${id}`);
}

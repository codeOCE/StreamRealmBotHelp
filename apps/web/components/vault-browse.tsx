import { fetchDirectory } from "@/lib/vault";
import { VaultBrowseClient, type VaultSearchParams } from "@/components/vault-browse-client";

export type { VaultSearchParams };

/**
 * Server wrapper for the public vault browser: fetches page 1 with the incoming
 * URL filters so the initial grid is server-rendered (SEO/first paint), then
 * hands it to the interactive client browser which takes over for live search,
 * filtering, sorting, view-switching, and load-more.
 */
export async function VaultBrowse({ sp }: { sp: VaultSearchParams }) {
  const params = new URLSearchParams();
  if (sp.q) params.set("q", sp.q);
  if (sp.tag) params.set("tag", sp.tag);
  if (sp.animated) params.set("animated", sp.animated);
  if (sp.overlaying) params.set("overlaying", sp.overlaying);
  if (sp.exact) params.set("exact", sp.exact);
  if (sp.sort) params.set("sort", sp.sort);
  params.set("page", "1");

  const { emotes, total } = await fetchDirectory(params);

  return <VaultBrowseClient initialEmotes={emotes} initialTotal={total} initialSp={sp} />;
}

import type { MetadataRoute } from "next";
import { fetchDirectory, isVaultHost } from "@/lib/vault";

const BASE = "https://emotes.creatorcastle.gg";
/** Sitemaps cap at 50k URLs; the directory endpoint pages at 48. */
const PAGE = 48;
const MAX_PAGES = 60;

export const revalidate = 3600;

/**
 * Vault sitemap — every emote and every creator profile, so each one can be
 * found by search rather than only through the browse UI. Returns empty on the
 * app host, which is disallowed in robots anyway.
 *
 * ponytail: pages the public directory rather than adding a bulk id endpoint;
 * at ~2,900 URLs that's fine, and it revalidates hourly. If the vault outgrows
 * MAX_PAGES this wants a dedicated id-only route and a sitemap index.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!(await isVaultHost())) return [];

  const entries: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "daily", priority: 1 },
  ];

  const creators = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({ sort: "new", page: String(page) });
    const { emotes } = await fetchDirectory(params);
    if (!emotes.length) break;

    for (const e of emotes) {
      entries.push({
        url: `${BASE}/emotes/${e.id}`,
        lastModified: e.createdAt ? new Date(e.createdAt) : undefined,
        changeFrequency: "weekly",
        priority: 0.8,
      });
      if (e.owner) creators.add(e.owner);
    }
    if (emotes.length < PAGE) break;
  }

  for (const name of creators) {
    entries.push({
      url: `${BASE}/user/${encodeURIComponent(name)}`,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  return entries;
}

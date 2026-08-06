import type { MetadataRoute } from "next";
import { headers } from "next/headers";

/**
 * Host-aware robots. The two sites share one deployment, so this has to answer
 * differently per host: the vault wants crawling (that's its whole purpose),
 * while the app is a signed-in dashboard with nothing worth indexing.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") || "";
  const isVault = host.startsWith("emotes.");

  if (!isVault) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Nothing here is useful to a crawler, and /admin must never surface.
      disallow: ["/admin", "/studio", "/api/"],
    },
    sitemap: "https://emotes.creatorcastle.gg/sitemap.xml",
    host: "https://emotes.creatorcastle.gg",
  };
}

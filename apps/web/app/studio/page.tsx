import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isVaultHost } from "@/lib/vault";
import { VaultChrome } from "@/components/vault-chrome";
import { StudioClient } from "@/components/studio-client";

// Studio is the Vault's own authenticated area. Only on emotes.creatorcastle.gg
// (404 on app.creatorcastle.gg, which has its own /dashboard/emotes). Not indexed.
export async function generateMetadata(): Promise<Metadata> {
  if (!(await isVaultHost())) return {};
  return { title: "Studio — Castle Vault", robots: { index: false, follow: false } };
}

export default async function StudioPage() {
  if (!(await isVaultHost())) notFound();
  return (
    <VaultChrome active="studio">
      <StudioClient />
    </VaultChrome>
  );
}

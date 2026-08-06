import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isVaultHost } from "@/lib/vault";
import { VaultChrome } from "@/components/vault-chrome";
import { VaultAdminClient } from "@/components/vault-admin-client";

// Staff-only, and never indexed — the real gate is PLATFORM_ADMIN_IDS on the
// worker; this just keeps the page out of search results.
export const metadata: Metadata = {
  title: "Review Queue",
  robots: { index: false, follow: false },
};

export default async function VaultAdminPage() {
  if (!(await isVaultHost())) notFound();
  return (
    <VaultChrome active="admin">
      <VaultAdminClient />
    </VaultChrome>
  );
}

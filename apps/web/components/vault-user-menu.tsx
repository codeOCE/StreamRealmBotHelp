"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchCurrentUser } from "@/lib/dev-auth";

/**
 * Auth-aware corner of the Vault nav. The session cookie is shared across
 * *.creatorcastle.gg, so /api/user/me (proxied same-origin) resolves the same
 * logged-in creator here as on the dashboard. Logged out → Sign in; logged in →
 * Upload + avatar into the Studio.
 */
export function VaultUserMenu() {
  // undefined = still loading, null = logged out, object = logged in
  const [user, setUser] = useState<Record<string, unknown> | null | undefined>(undefined);

  useEffect(() => {
    fetchCurrentUser().then((u) => setUser(u ?? null)).catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    return <div className="w-9 h-9 rounded-full bg-white/5 animate-pulse shrink-0" />;
  }

  if (!user) {
    return (
      <a href="/auth/twitch" className="saas-button shrink-0" style={{ padding: "0.5rem 1.25rem", fontSize: "0.625rem" }}>
        Sign in
      </a>
    );
  }

  const avatar = (user.avatar || user.avatarUrl || user.avatar_url) as string | undefined;
  const name = (user.username || user.displayName || user.display_name || "You") as string;

  return (
    <div className="flex items-center gap-3 shrink-0">
      <Link href="/studio" className="saas-button-secondary !h-9 !px-4 !text-xs hidden sm:inline-flex items-center gap-1.5">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" /></svg>
        Upload
      </Link>
      <Link href="/studio" title={name} className="block">
        <img
          src={avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=guest"}
          alt={name}
          className="w-9 h-9 rounded-full border border-white/10 object-cover"
        />
      </Link>
    </div>
  );
}

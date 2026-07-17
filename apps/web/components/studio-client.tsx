"use client";

import { useEffect, useState } from "react";
import { fetchCurrentUser } from "@/lib/dev-auth";
import EmotesPage from "@/app/dashboard/emotes/page";

/**
 * Castle Vault Studio — the authenticated management surface, on the emotes
 * subdomain (not the dashboard). Reuses the existing emote manager wholesale
 * (upload, my emotes, add-from-directory); the shared *.creatorcastle.gg session
 * cookie means the same logged-in creator resolves here. Gates on sign-in so
 * uploads never 401 silently.
 */
export function StudioClient() {
  const [user, setUser] = useState<Record<string, unknown> | null | undefined>(undefined);

  useEffect(() => {
    fetchCurrentUser().then((u) => setUser(u ?? null)).catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    return <div className="py-24 text-center text-zinc-600 text-sm font-semibold">Loading your Studio…</div>;
  }

  if (!user) {
    return (
      <div className="py-24 flex flex-col items-center gap-4 text-center">
        <div className="text-5xl opacity-30">🔑</div>
        <h2 className="text-xl font-black text-white font-heading">Sign in to open your Studio</h2>
        <p className="text-zinc-500 text-sm max-w-sm">
          Upload custom emotes, manage your collection, and share your best to the public vault.
        </p>
        <a href="/auth/twitch" className="saas-button">Sign in with Twitch</a>
      </div>
    );
  }

  return <EmotesPage />;
}

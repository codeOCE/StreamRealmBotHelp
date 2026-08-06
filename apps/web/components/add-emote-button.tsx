"use client";

import { useEffect, useState } from "react";

type State = "idle" | "busy" | "added" | "error";

/**
 * Add-to-my-channel action, shared by the card hover overlay and the emote
 * detail page. Hits the same endpoint the Studio uses (POST /api/emotes/:id/add,
 * same-origin proxied, session cookie shared across *.creatorcastle.gg). A 401
 * means "not signed in" → send them through Twitch OAuth.
 */
export function AddEmoteButton({
  id,
  compact = false,
  alreadyAdded = false,
}: {
  id: string;
  compact?: boolean;
  /** Seeded from the viewer's channel set so the vault opens already ticked. */
  alreadyAdded?: boolean;
}) {
  const [state, setState] = useState<State>(alreadyAdded ? "added" : "idle");

  // The channel set arrives async, after these buttons have already mounted.
  useEffect(() => {
    if (alreadyAdded) setState("added");
  }, [alreadyAdded]);

  const add = async (ev: React.MouseEvent) => {
    // Cards wrap this in a <Link>; don't navigate when the button is clicked.
    ev.preventDefault();
    ev.stopPropagation();
    if (state === "busy" || state === "added") return;

    setState("busy");
    try {
      const res = await fetch(`/api/emotes/${id}/add`, { method: "POST", credentials: "include" });
      if (res.status === 401) {
        window.location.href = "/auth/twitch";
        return;
      }
      setState(res.ok ? "added" : "error");
    } catch {
      setState("error");
    }
  };

  const label =
    state === "added" ? "Added ✓" : state === "busy" ? "Adding…" : state === "error" ? "Try again" : "+ Add";

  if (compact) {
    return (
      <button
        onClick={add}
        title="Add to my channel"
        className={`px-2 py-1 rounded text-[9px] font-black uppercase transition-colors ${
          state === "added"
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-brand-primary text-black hover:bg-white"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <button onClick={add} className="saas-button inline-block disabled:opacity-50" disabled={state === "busy"}>
      {state === "added" ? "Added to your channel ✓" : state === "busy" ? "Adding…" : "Add to my channel →"}
    </button>
  );
}

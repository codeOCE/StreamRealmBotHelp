"use client";

import { useEffect, useState } from "react";
import { checker } from "@/lib/vault-shared";

type Pending = {
  id: string;
  code: string;
  image_url: string;
  width: number;
  animated: boolean;
  created_at: string;
};

/**
 * Platform-admin review queue — the gate every shared emote passes through
 * before it appears in the public vault. Gated server-side by PLATFORM_ADMIN_IDS;
 * this just renders whatever /api/emotes/pending is willing to return, so a
 * 403 here means "you're not on the admin list", not a bug.
 */
export function VaultAdminClient() {
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "forbidden" | "anon" | "error">("loading");
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = async () => {
    try {
      const res = await fetch("/api/emotes/pending", { credentials: "include" });
      if (res.status === 401) return setState("anon");
      if (res.status === 403) return setState("forbidden");
      if (!res.ok) return setState("error");
      const j = await res.json();
      setRows(Array.isArray(j.emotes) ? j.emotes : []);
      setState("ok");
    } catch {
      setState("error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (id: string, what: "approve" | "reject") => {
    setBusy((b) => ({ ...b, [id]: true }));
    const res = await fetch(`/api/emotes/${id}/${what}`, { method: "POST", credentials: "include" });
    // Drop it from the queue on success; on failure leave it so it can be retried.
    if (res.ok) setRows((rs) => (rs ?? []).filter((r) => r.id !== id));
    setBusy((b) => ({ ...b, [id]: false }));
  };

  if (state === "loading") return <Msg>Loading the queue…</Msg>;
  if (state === "anon")
    return (
      <Msg>
        <a href="/auth/twitch" className="text-brand-primary hover:underline">Sign in</a> to review submissions.
      </Msg>
    );
  if (state === "forbidden")
    return <Msg>Your account isn&rsquo;t a platform admin. Add your Twitch ID to PLATFORM_ADMIN_IDS.</Msg>;
  if (state === "error") return <Msg>Couldn&rsquo;t load the queue.</Msg>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white font-heading">Review Queue</h1>
        <p className="text-brand-muted text-sm font-medium mt-1">
          {rows!.length === 0
            ? "Nothing waiting — every submitted emote has been reviewed."
            : `${rows!.length} emote${rows!.length === 1 ? "" : "s"} awaiting review before going public.`}
        </p>
      </div>

      {rows!.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {rows!.map((e) => (
            <div key={e.id} className="glass-card rounded-2xl border border-white/5 overflow-hidden">
              <div className="h-28 flex items-center justify-center" style={checker}>
                <img src={e.image_url} alt={e.code} style={{ height: Math.min(72, e.width) }} className="object-contain" />
              </div>
              <div className="px-3 py-2.5 border-t border-white/5 space-y-2.5">
                <div>
                  <code className="text-xs font-black text-white truncate block">{e.code}</code>
                  <p className="text-[10px] text-zinc-600">
                    {new Date(e.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {e.animated && " · animated"}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => act(e.id, "approve")}
                    disabled={busy[e.id]}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors disabled:opacity-40"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => act(e.id, "reject")}
                    disabled={busy[e.id]}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase bg-white/5 text-zinc-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors disabled:opacity-40"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Msg({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-24 flex flex-col items-center gap-3 text-center">
      <div className="text-4xl opacity-30">🛡️</div>
      <p className="text-zinc-500 text-sm font-semibold">{children}</p>
    </div>
  );
}

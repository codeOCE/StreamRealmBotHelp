"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { apiUrl, fetchJson } from "@/lib/api";
import { fetchCurrentUser } from "@/lib/dev-auth";
import { FeatureHeader, FeaturePage } from "@/components/dashboard/FeatureUI";

type Stats = { streamTitle: string | null; gameName: string | null; isLive: boolean };

export default function SettingsPage() {
    const [user, setUser] = useState<any>(null);
    const [live, setLive] = useState(false);
    const [title, setTitle] = useState("");
    const [game, setGame] = useState("");
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchCurrentUser().then(setUser);
        fetchJson("/api/dashboard/stats").then((s) => {
            const d = s as Stats | null;
            if (d) {
                setTitle(d.streamTitle ?? "");
                setGame(d.gameName ?? "");
                setLive(!!d.isLive);
            }
            setLoaded(true);
        });
    }, []);

    const saveChannel = async () => {
        setSaving(true);
        const res = await fetch(apiUrl("/api/dashboard/channel"), {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, game }),
        });
        setSaving(false);
        toast(res.ok ? "Channel updated" : "Twitch rejected the update");
    };

    const logout = async () => {
        await fetch(apiUrl("/api/auth/logout"), { method: "POST", credentials: "include" }).catch(() => {});
        window.location.href = "/";
    };

    return (
        <FeaturePage>
            <FeatureHeader
                icon={Settings}
                title="Settings"
                subtitle="Your account, channel, and bot — in one place."
            />

            {/* Identity band */}
            <div className="bento-card !rounded-2xl p-6 flex flex-wrap items-center gap-5">
                <img
                    src={user?.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=guest"}
                    alt=""
                    className="w-20 h-20 rounded-2xl object-cover border border-white/10 shrink-0"
                />
                <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                        <h2 className="text-xl font-black text-white truncate">{user?.displayName || user?.username || "Guest"}</h2>
                        {live && (
                            <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-400">
                                <span className="live-dot" /> Live
                            </span>
                        )}
                    </div>
                    <p className="text-xs font-semibold text-zinc-500 mt-0.5">@{user?.username || "—"}</p>
                    <div className="flex items-center gap-2 mt-2.5">
                        <span className="void-badge void-badge-muted">{user?.isConnected ? "Twitch linked" : "Not linked"}</span>
                    </div>
                </div>
                <a
                    href="/auth/twitch?reauth=1"
                    className="ml-auto self-start text-[11px] font-bold text-zinc-500 hover:text-brand-primary transition-colors"
                >
                    Reconnect Twitch →
                </a>
            </div>

            {/* Stream setup — the real form */}
            <div className="bento-card p-7 space-y-5">
                <div>
                    <h3 className="text-sm font-bold text-zinc-200">Stream setup</h3>
                    <p className="text-xs text-zinc-500 font-medium mt-1">
                        Pushes straight to Twitch. Changes apply to your channel immediately.
                    </p>
                </div>

                <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-zinc-400 ml-1">Stream title</span>
                    <textarea
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        rows={2}
                        maxLength={140}
                        placeholder={loaded ? "What are you streaming today?" : "Loading…"}
                        className="void-input w-full resize-none"
                    />
                    <span className="text-[10px] text-zinc-600 font-medium ml-1">{title.length}/140</span>
                </label>

                <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-zinc-400 ml-1">Category</span>
                    <input
                        value={game}
                        onChange={(e) => setGame(e.target.value)}
                        placeholder="e.g. Just Chatting"
                        className="void-input w-full"
                    />
                </label>

                <div className="flex justify-end">
                    <button type="button" onClick={saveChannel} disabled={saving || !loaded} className="saas-button disabled:opacity-50">
                        {saving ? "Saving…" : "Save channel"}
                    </button>
                </div>
            </div>

            {/* Two-up: bot + account */}
            <div className="grid gap-4 sm:grid-cols-2">
                <Link href="/dashboard/integrations" className="bento-card !rounded-2xl p-6 group hover:!border-brand-primary/25 transition-colors">
                    <p className="text-[10px] font-black text-zinc-600 ">Chat bot</p>
                    <p className="text-base font-black text-white mt-2 truncate">{user?.botUsername || "Not connected"}</p>
                    <p className="text-[11px] text-zinc-500 font-medium mt-1 group-hover:text-brand-primary transition-colors">Manage bot & integrations →</p>
                </Link>

                <div className="bento-card !rounded-2xl p-6">
                    <p className="text-[10px] font-black text-zinc-600 ">Target channel</p>
                    <p className="text-base font-black text-white mt-2 truncate">{user?.targetChannel || user?.username || "—"}</p>
                    <p className="text-[11px] text-zinc-500 font-medium mt-1">Where the bot reads & posts.</p>
                </div>
            </div>

            {/* Danger strip — only rose element on the page */}
            <div className="bento-card !rounded-2xl p-5 flex items-center gap-4 border-rose-500/20 bg-rose-500/[0.03]">
                <div className="min-w-0">
                    <p className="text-sm font-bold text-rose-200">Log out</p>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5">Ends your session on this device.</p>
                </div>
                <button
                    type="button"
                    onClick={() => { toast("Logging out…"); logout(); }}
                    className="ml-auto shrink-0 px-4 py-2 rounded-xl text-[11px] font-black text-rose-300 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-colors cursor-pointer"
                >
                    Log out
                </button>
            </div>
        </FeaturePage>
    );
}

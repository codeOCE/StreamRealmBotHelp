"use client";

import { useEffect, useMemo, useState } from "react";
import { Quote } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { toast } from "sonner";
import { CommandChip, DeleteButton, EmptyState, Field, Panel } from "@/components/dashboard/FeatureUI";

interface Quote { number: number; text: string; addedBy: string | null; game: string | null; createdAt: string; }
const BASE = apiUrl("/api/quotes");
const MAX_LEN = 400;

export function QuotesManager() {
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [text, setText] = useState("");
    const [game, setGame] = useState("");
    const [search, setSearch] = useState("");

    const load = async () => {
        const r = await fetch(BASE, { credentials: "include" }).then((x) => x.json()).catch(() => ({}));
        setQuotes(Array.isArray(r.quotes) ? r.quotes : []);
    };

    useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return quotes;
        return quotes.filter((x) => x.text.toLowerCase().includes(q) || x.addedBy?.toLowerCase().includes(q) || x.game?.toLowerCase().includes(q) || String(x.number).includes(q));
    }, [quotes, search]);

    const add = async () => {
        const t = text.trim();
        if (!t) { toast.error("Enter quote text"); return; }
        setAdding(true);
        try {
            const res = await fetch(BASE, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ text: t, game: game.trim() || undefined }) });
            if (!res.ok) { toast.error("Could not add quote"); return; }
            const data = await res.json().catch(() => ({}));
            toast.success(data.quote?.number ? `Quote #${data.quote.number} added` : "Quote added");
            setText(""); setGame("");
            await load();
        } finally { setAdding(false); }
    };

    const remove = async (n: number) => {
        if (!confirm(`Delete quote #${n}?`)) return;
        const res = await fetch(`${BASE}/${n}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) { toast.error("Could not delete"); return; }
        setQuotes((qs) => qs.filter((q) => q.number !== n));
        toast.success("Quote deleted");
    };

    return (
        <div className="space-y-6">
            <p className="text-brand-muted text-sm">
                Recalled in chat with <CommandChip>!quote</CommandChip> or <CommandChip>!quote &lt;n&gt;</CommandChip>.
            </p>

            <Panel>
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); add(); }}>
                    <div className="flex flex-wrap gap-3 items-end">
                        <Field label="Quote"><input value={text} onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))} placeholder="Something memorable…" className="void-input flex-1 min-w-[16rem]" /></Field>
                        <Field label="Game"><input value={game} onChange={(e) => setGame(e.target.value)} placeholder="Optional" className="void-input w-36" /></Field>
                        <button type="submit" disabled={adding} className="saas-button h-12 disabled:opacity-50">{adding ? "Adding…" : "Add quote"}</button>
                    </div>
                    <p className="text-[10px] text-zinc-600 ml-1">{text.length}/{MAX_LEN}</p>
                </form>
            </Panel>

            {quotes.length > 3 && (
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quotes…" className="void-input max-w-sm" />
            )}

            {loading ? <div className="skeleton h-24 w-full rounded-xl" /> : quotes.length === 0 ? (
                <EmptyState icon={Quote} title="No quotes yet" description="Add one above or use !addquote in chat." />
            ) : filtered.length === 0 ? (
                <p className="text-xs text-zinc-600 py-8 text-center font-semibold">No quotes match your search.</p>
            ) : (
                <div className="space-y-2 max-h-[32rem] overflow-y-auto custom-scrollbar">
                    {filtered.map((q) => (
                        <div key={q.number} className="bento-card !rounded-2xl p-4 flex items-start justify-between gap-4 hover:!translate-y-0">
                            <div className="min-w-0">
                                <p className="text-white text-sm break-words leading-relaxed">
                                    <span className="text-brand-primary font-black mr-2 tabular-nums">#{q.number}</span>
                                    {q.text}
                                </p>
                                {(q.game || q.addedBy) && (
                                    <p className="text-[10px] text-zinc-600  font-black mt-1.5">
                                        {q.game ? `${q.game} · ` : ""}{q.addedBy ? `added by ${q.addedBy}` : ""}
                                    </p>
                                )}
                            </div>
                            <DeleteButton onClick={() => remove(q.number)} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

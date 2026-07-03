"use client";

import { useEffect, useState } from "react";
import { Hash } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { toast } from "sonner";
import { CommandChip, EmptyState, Field } from "@/components/dashboard/FeatureUI";

interface Counter { name: string; value: number; updatedAt: string; }
const BASE = apiUrl("/api/counters");

export function CountersManager() {
    const [counters, setCounters] = useState<Counter[]>([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState("");
    const [value, setValue] = useState(0);
    const [busy, setBusy] = useState<string | null>(null);

    const load = async () => {
        const r = await fetch(BASE, { credentials: "include" }).then((x) => x.json()).catch(() => ({}));
        setCounters(Array.isArray(r.counters) ? r.counters : []);
    };

    useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, []);

    const create = async () => {
        const n = name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
        if (!n) { toast.error("Enter a valid counter name"); return; }
        setBusy("create");
        try {
            const res = await fetch(BASE, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name: n, value }) });
            if (!res.ok) { toast.error("Could not create counter"); return; }
            toast.success(`Counter "${n}" created`);
            setName(""); setValue(0);
            await load();
        } finally { setBusy(null); }
    };

    const bump = async (n: string, delta: number) => {
        setCounters((cs) => cs.map((c) => (c.name === n ? { ...c, value: c.value + delta } : c)));
        const res = await fetch(`${BASE}/${encodeURIComponent(n)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ delta }) });
        if (!res.ok) { toast.error("Update failed"); load(); return; }
        const data = await res.json().catch(() => ({}));
        if (typeof data.value === "number") setCounters((cs) => cs.map((c) => (c.name === n ? { ...c, value: data.value } : c)));
    };

    const reset = async (n: string) => {
        setCounters((cs) => cs.map((c) => (c.name === n ? { ...c, value: 0 } : c)));
        const res = await fetch(`${BASE}/${encodeURIComponent(n)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ value: 0 }) });
        if (!res.ok) { toast.error("Reset failed"); load(); }
    };

    const remove = async (n: string) => {
        if (!confirm(`Delete counter "${n}"?`)) return;
        const res = await fetch(`${BASE}/${encodeURIComponent(n)}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) { toast.error("Could not delete"); return; }
        setCounters((cs) => cs.filter((c) => c.name !== n));
        toast.success("Counter deleted");
    };

    return (
        <div className="space-y-6">
            <p className="text-brand-muted text-sm">
                Viewers read counters with <CommandChip>!count &lt;name&gt;</CommandChip>. Mods bump them with <CommandChip>!addcount</CommandChip>.
            </p>

            <form className="flex flex-wrap gap-3 items-end" onSubmit={(e) => { e.preventDefault(); create(); }}>
                <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="deaths" className="void-input" /></Field>
                <Field label="Start value"><input type="number" value={value} onChange={(e) => setValue(Math.trunc(Number(e.target.value) || 0))} className="void-input w-28" /></Field>
                <button type="submit" disabled={busy === "create"} className="saas-button h-12 disabled:opacity-50">{busy === "create" ? "Adding…" : "Add counter"}</button>
            </form>

            {loading ? <div className="skeleton h-24 w-full rounded-xl" /> : counters.length === 0 ? (
                <EmptyState icon={Hash} title="No counters yet" description="Add one above or let chat create them with !addcount." />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {counters.map((c) => (
                        <div key={c.name} className="bento-card holo-card p-5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[10px] font-black  text-zinc-500 truncate">{c.name}</p>
                                <p className="metric-value !text-4xl mt-1">{c.value.toLocaleString()}</p>
                            </div>
                            <div className="flex flex-col gap-1.5 shrink-0">
                                <div className="flex gap-1.5">
                                    <button type="button" onClick={() => bump(c.name, 1)} className="w-9 h-9 rounded-lg bg-brand-primary/15 text-brand-primary border border-brand-primary/30 font-black hover:bg-brand-primary hover:text-[#05070a] transition-all cursor-pointer">+</button>
                                    <button type="button" onClick={() => bump(c.name, -1)} className="w-9 h-9 rounded-lg bg-white/[0.03] text-zinc-400 border border-white/10 font-black hover:text-white transition-colors cursor-pointer">−</button>
                                </div>
                                <div className="flex gap-1.5">
                                    <button type="button" onClick={() => reset(c.name)} className="px-2 h-7 rounded-lg bg-white/[0.03] text-zinc-500 border border-white/10 text-[9px] font-black uppercase hover:text-white transition-colors cursor-pointer">Reset</button>
                                    <button type="button" onClick={() => remove(c.name)} className="px-2 h-7 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[9px] font-black uppercase hover:bg-rose-500/20 transition-colors cursor-pointer">Del</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

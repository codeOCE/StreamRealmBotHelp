"use client";

import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Terminal, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface SimulationResult {
    response: string | null;
    logs: string[];
    variables: any;
}

import { cn } from "@/lib/utils";

export function CommandTester() {
    const [trigger, setTrigger] = useState("");
    const [args, setArgs] = useState("");
    const [username, setUsername] = useState("stream_tester");
    const [result, setResult] = useState<SimulationResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleRun = async () => {
        if (!trigger) {
            toast.error("Please enter a command trigger");
            return;
        }

        setIsLoading(true);
        setResult(null);

        try {
            const tenantId = "07c4f588-4b5e-4def-a423-f459491b76b4";

            const res = await fetch("/api/commands/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tenantId,
                    trigger,
                    args,
                    username
                }),
                credentials: 'include',
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || "Test failed");
            }

            const data = await res.json();
            setResult(data);
            toast.success("Test complete");

        } catch (error: any) {
            console.error(error);
            toast.error(error.message || "Failed to run test");
            setResult({
                response: null,
                logs: [`Error: ${error.message}`],
                variables: {}
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div className="space-y-8">
                <div className="space-y-3">
                    <Label htmlFor="trigger" className="text-[10px] font-black  text-zinc-600 ml-4 italic">Trigger</Label>
                    <Input
                        id="trigger"
                        placeholder="!UPTIME"
                        value={trigger}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setTrigger(e.target.value)}
                        className="bg-black/40 border-white/5 rounded-2xl h-14 px-8 font-black text-white focus:ring-2 focus:ring-brand-primary/40 placeholder:text-zinc-900 italic"
                    />
                </div>

                <div className="space-y-3">
                    <Label htmlFor="args" className="text-[10px] font-black  text-zinc-600 ml-4 italic">Parameters</Label>
                    <Input
                        id="args"
                        placeholder="E.G. @USER OR 123"
                        value={args}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setArgs(e.target.value)}
                        className="bg-black/40 border-white/5 rounded-2xl h-14 px-8 font-black text-white focus:ring-2 focus:ring-brand-primary/40 placeholder:text-zinc-900 italic"
                    />
                </div>

                <div className="space-y-3">
                    <Label htmlFor="username" className="text-[10px] font-black  text-zinc-600 ml-4 italic">Username</Label>
                    <Input
                        id="username"
                        value={username}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                        className="bg-black/40 border-white/5 rounded-2xl h-14 px-8 font-black text-white focus:ring-2 focus:ring-brand-primary/40 italic"
                    />
                </div>

                <Button
                    onClick={handleRun}
                    disabled={isLoading}
                    className="w-full h-16 bg-brand-primary hover:bg-white hover:text-brand-primary text-white rounded-2xl font-black text-[11px]  italic shadow-glow-p border border-brand-primary/20 transition-all active:scale-95"
                >
                    {isLoading ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : <Play className="mr-3 h-5 w-5 fill-current" />}
                    Run Test
                </Button>
            </div>

            <div className="bg-black/60 rounded-[2.5rem] border border-white/5 p-8 font-mono text-sm h-[480px] overflow-y-auto flex flex-col shadow-inner relative group/terminal">
                <div className="absolute inset-0 bg-brand-primary/[0.02] opacity-0 group-hover/terminal:opacity-100 transition-opacity pointer-events-none" />

                <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6">
                    <div className="flex items-center text-zinc-600 gap-3">
                        <Terminal size={18} className="text-brand-primary shadow-glow-p" />
                        <span className="text-[10px] font-black  italic">Output</span>
                    </div>
                    <div className="flex gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500/20" />
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20" />
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20" />
                    </div>
                </div>

                {result ? (
                    <div className="space-y-10 relative z-10">
                        <div className="space-y-3">
                            <span className="text-brand-primary font-black text-[10px]  italic opacity-60">Response</span>
                            <div className="p-6 bg-white/[0.02] rounded-2xl text-white font-bold whitespace-pre-wrap border border-white/5 shadow-inner italic">
                                {result.response || "No response"}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <span className="text-brand-secondary font-black text-[10px]  italic opacity-60">Variables</span>
                            <pre className="p-6 bg-white/[0.02] rounded-2xl text-zinc-500 text-xs overflow-x-auto border border-white/5 shadow-inner">
                                {JSON.stringify(result.variables, null, 2)}
                            </pre>
                        </div>

                        <div className="space-y-3 pb-4">
                            <span className="text-amber-500 font-black text-[10px]  italic opacity-60">Logs</span>
                            <div className="space-y-2 text-zinc-600 text-[11px] font-medium px-2">
                                {result.logs.map((log, i) => (
                                    <div key={i} className="flex gap-4">
                                        <span className="opacity-20">[{i.toString().padStart(2, '0')}]</span>
                                        <span>{log}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-800 gap-6">
                        <div className="w-16 h-16 rounded-3xl border-2 border-current border-dashed animate-spin duration-[10s] opacity-20" />
                        <p className="text-[10px] font-black  italic opacity-40">Run a test to see the output</p>
                    </div>
                )}
            </div>
        </div>
    );
}

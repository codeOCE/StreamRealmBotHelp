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
            // Hardcoded tenant ID for now
            const tenantId = "07c4f588-4b5e-4def-a423-f459491b76b4";

            const res = await fetch("http://localhost:3001/commands/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tenantId,
                    trigger,
                    args,
                    username
                })
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || "Simulation failed");
            }

            const data = await res.json();
            setResult(data);
            toast.success("Simulation complete");

        } catch (error: any) {
            console.error(error);
            toast.error(error.message || "Failed to run simulation");
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-4">
                <div className="grid gap-2">
                    <Label htmlFor="trigger">Command Trigger</Label>
                    <Input
                        id="trigger"
                        placeholder="!uptime"
                        value={trigger}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setTrigger(e.target.value)}
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="args">Arguments (Optional)</Label>
                    <Input
                        id="args"
                        placeholder="e.g. @user or 123"
                        value={args}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setArgs(e.target.value)}
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="username">Simulate as User</Label>
                    <Input
                        id="username"
                        value={username}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                    />
                </div>

                <Button onClick={handleRun} disabled={isLoading} className="w-full">
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    Run Simulation
                </Button>
            </div>

            <div className="bg-slate-950 rounded-lg border border-slate-800 p-4 font-mono text-sm h-[400px] overflow-y-auto flex flex-col">
                <div className="flex items-center text-slate-400 mb-4 border-b border-slate-800 pb-2">
                    <Terminal className="mr-2 h-4 w-4" />
                    <span>Output Console</span>
                </div>

                {result ? (
                    <div className="space-y-4">
                        <div>
                            <span className="text-green-500 font-bold">$ Response:</span>
                            <div className="mt-1 p-2 bg-slate-900 rounded text-slate-200 whitespace-pre-wrap border border-slate-800">
                                {result.response || "<No Response>"}
                            </div>
                        </div>

                        <div>
                            <span className="text-blue-500 font-bold">$ Variables Context:</span>
                            <pre className="mt-1 p-2 bg-slate-900 rounded text-slate-400 text-xs overflow-x-auto border border-slate-800">
                                {JSON.stringify(result.variables, null, 2)}
                            </pre>
                        </div>

                        <div>
                            <span className="text-yellow-500 font-bold">$ Execution Logs:</span>
                            <div className="mt-1 space-y-1 text-slate-500 text-xs">
                                {result.logs.map((log, i) => (
                                    <div key={i}>{log}</div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-slate-600 italic mt-10 text-center">
                        Ready to simulate. Enter a command and press Run.
                    </div>
                )}
            </div>
        </div>
    );
}

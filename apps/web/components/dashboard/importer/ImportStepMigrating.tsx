"use client";

import { useEffect, useState } from "react";
import { useImport } from "./ImportContext";
import { Loader2, Terminal } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export function ImportStepMigrating() {
    const { state, addLog, setStep, onComplete } = useImport();
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const executeMigration = async () => {
            try {
                // Get tenant ID
                const userRes = await fetch('/api/user/me', { credentials: 'include' });
                if (!userRes.ok) throw new Error("Failed to authenticate for migration");
                const userData = await userRes.json();
                const tenantId = userData.tenantId;

                console.log(`[Migration Debug] Total Items available: ${state.items.length}`);
                console.log(`[Migration Debug] Total Selected in Set: ${state.selectedItems.size}`);

                let selectedCommands: any[] = [];

                // Fallback: If heuristic matches (selected size approx equals total), and filter is failing, try sending all
                // OR if filter returns 0/low but set is high.

                selectedCommands = state.items.filter(item => {
                    const id = item._id || item.id || item.name || item.command || item.trigger;
                    const match = state.selectedItems.has(id);
                    // Log first few failures to see why
                    if (!match && selectedCommands.length < 5) {
                        console.log(`[Filter Fail] ID: ${id} | In Set: ${match}`);
                        // Dump set content sample
                        if (selectedCommands.length === 0) {
                            console.log('Set Sample:', Array.from(state.selectedItems).slice(0, 3));
                        }
                    }
                    return match;
                });

                // EMERGENCY FALLBACK for "Select All" case
                if (selectedCommands.length < state.selectedItems.size && state.selectedItems.size === state.items.length) {
                    console.log('[Migration Debug] Mismatch detected but "Select All" appears active. sending ALL items.');
                    selectedCommands = [...state.items];
                }

                console.log(`[Migration Debug] Final Commands to Send: ${selectedCommands.length}`);
                addLog(`Debug: Sending ${selectedCommands.length} commands to server...`);

                if (selectedCommands.length === 0) {
                    addLog("No commands selected for migration.");
                    setTimeout(() => setStep('select'), 1500);
                    return;
                }

                let currentProgress = 0;
                addLog(`Preparing to migrate ${selectedCommands.length} commands...`);

                // Simulate initial handshake
                const timer = setInterval(() => {
                    currentProgress += 10;
                    if (currentProgress > 60) clearInterval(timer);
                    setProgress(currentProgress);
                }, 100);

                addLog("Handshaking with secure vault...");

                const payload = {
                    tenantId,
                    provider: state.provider,
                    commands: selectedCommands
                };

                const res = await fetch('/api/commands/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                clearInterval(timer); // Clear simulated progress if API returns fast

                if (!res.ok) {
                    const error = await res.json();
                    throw new Error(error.message || "Migration process rejected by server");
                }

                const result = await res.json();

                setProgress(100);
                addLog(`✓ Successfully secured ${result.imported} protocols!`);
                if (result.skipped > 0) addLog(`⚠ ${result.skipped} duplicates detected and skipped.`);
                if (result.failed > 0) {
                    addLog(`✕ ${result.failed} items failed validation.`);
                    if (result.failedCommands && Array.isArray(result.failedCommands)) {
                        result.failedCommands.forEach((err: string) => addLog(`ERR: ${err}`));
                    }
                }

                // Small delay for UX
                setTimeout(() => {
                    setStep('complete');
                    if (onComplete) onComplete(selectedCommands);
                }, 800);

            } catch (error: any) {
                console.error(error);
                addLog(`CRITICAL ERROR: ${error.message}`);
                setProgress(0);
                // Allow retry by going back or showing error state?
                // For now, let user see the error log.
            }
        };

        executeMigration();
    }, []);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="text-center space-y-3">
                <div className="relative inline-block">
                    <div className="w-20 h-20 rounded-full border-4 border-white/5 flex items-center justify-center">
                        <Loader2 className="w-10 h-10 text-brand-primary animate-spin" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] font-black text-white">{progress}%</span>
                    </div>
                </div>
                <h3 className="text-xl font-black text-white uppercase italic">Syncing Protocols</h3>
                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest italic animate-pulse">Writing to local registry...</p>
            </div>

            <div className="glass-card rounded-2xl border border-white/10 bg-black/40 overflow-hidden">
                <div className="px-4 py-2 border-b border-white/5 bg-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-3 h-3 text-zinc-500" />
                        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Migration Log</span>
                    </div>
                    <Badge variant="outline" className="text-[8px] border-brand-primary/20 text-brand-primary uppercase px-1.5 h-4">
                        Live Stream
                    </Badge>
                </div>

                <ScrollArea className="h-48 p-4 font-mono">
                    <div className="space-y-1.5">
                        {state.logs.map((log, i) => (
                            <div key={i} className={`text-[10px] flex gap-2 ${log.startsWith('✓') ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                <span className="text-zinc-700 select-none">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                                <span className="font-medium tracking-tight">{log}</span>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}

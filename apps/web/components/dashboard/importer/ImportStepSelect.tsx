"use client";

import { useImport } from "./ImportContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Loader2, PlayCircle, Search, CheckSquare, Square } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function ImportStepSelect() {
    const { state, setStep, toggleItem, setSelectedItems, addLog } = useImport();
    const [isMigrating, setIsMigrating] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    const getItemDetails = (item: any) => {
        // Backend returns transformed data with 'trigger' and 'responses' array
        // Nightbot/StreamElements raw data might have different fields
        const id = item._id || item.id || item.name || item.command || item.trigger;
        const trigger = item.name || item.command || item.trigger || "";

        let response = "";
        if (item.responses && item.responses.length > 0) {
            response = item.responses[0];
        } else {
            response = item.message || item.reply || item.response || "";
        }

        return { id, trigger, response };
    };

    const filteredItems = useMemo(() => {
        return state.items.filter((item: any) => {
            const { trigger, response } = getItemDetails(item);
            const searchLower = searchTerm.toLowerCase();
            return (
                (trigger && trigger.toLowerCase().includes(searchLower)) ||
                (response && response.toLowerCase().includes(searchLower))
            );
        });
    }, [state.items, searchTerm]);

    const handleSelectAll = () => {
        const allIds = new Set(filteredItems.map((i: any) => getItemDetails(i).id));
        if (state.selectedItems.size === allIds.size && allIds.size > 0) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(allIds);
        }
    };

    const isAllSelected = filteredItems.length > 0 && state.selectedItems.size === filteredItems.length;

    const handleMigrate = async () => {
        if (state.selectedItems.size === 0) {
            toast.error("Select at least one command to migrate");
            return;
        }

        setIsMigrating(true);
        setStep('migrating');
        addLog("Starting migration...");

        try {
            const selectedCommands = state.items.filter((i: any) => state.selectedItems.has(i.command || i._id));

            // Hardcoded tenant ID for now
            const tenantId = "07c4f588-4b5e-4def-a423-f459491b76b4";

            const res = await fetch("http://localhost:3001/commands/import/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tenantId,
                    provider: state.provider,
                    commands: selectedCommands
                })
            });

            if (!res.ok) throw new Error("Migration failed");

            const result = await res.json();
            addLog(`Successfully imported ${result.imported} commands.`);
            addLog(`Skipped: ${result.skipped}, Failed: ${result.failed}`);

            setStep('complete');
            toast.success("Migration complete!");

        } catch (error) {
            console.error(error);
            addLog(`Error: ${error}`);
            toast.error("One or more commands failed to migrate.");
        } finally {
            setIsMigrating(false);
        }
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
            <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep('connect')} className="text-zinc-400 hover:text-white">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1">
                        {state.items.length} Found
                    </Badge>
                </div>
            </div>

            <div className="flex items-center space-x-4 mb-6">
                <div className="relative flex-1 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within:text-brand-primary transition-colors" />
                    <Input
                        placeholder="Search commands (e.g. !discord, !socials)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 bg-slate-950/50 border-white/10 focus:border-brand-primary/50 text-white rounded-xl h-12 transition-all shadow-inner"
                    />
                </div>
                <Button
                    variant="outline"
                    onClick={handleSelectAll}
                    className="h-12 px-6 border-white/10 hover:bg-white/5 hover:text-white text-zinc-400 uppercase tracking-wider text-[10px] font-bold rounded-xl transition-all"
                >
                    {isAllSelected ? (
                        <><Square className="mr-2 h-4 w-4" /> Deselect All</>
                    ) : (
                        <><CheckSquare className="mr-2 h-4 w-4" /> Select All</>
                    )}
                </Button>
            </div>

            <div className="border border-white/10 rounded-xl bg-slate-950/30 overflow-hidden shadow-inner">
                <ScrollArea className="h-[400px]">
                    <div className="p-2 space-y-1">
                        {filteredItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[300px] text-zinc-500 gap-2">
                                <Search className="h-8 w-8 opacity-50" />
                                <p className="text-sm font-medium">No commands found matching "{searchTerm}"</p>
                            </div>
                        ) : filteredItems.map((cmd: any) => {
                            const { id, trigger, response } = getItemDetails(cmd);
                            if (!id) return null;

                            const isSelected = state.selectedItems.has(id);

                            return (
                                <div
                                    key={id}
                                    className={`
                                        flex items-center space-x-3 p-3 rounded-lg border transition-all duration-200 cursor-pointer group
                                        ${isSelected
                                            ? 'bg-brand-primary/10 border-brand-primary/30'
                                            : 'bg-transparent border-transparent hover:bg-white/[0.03] hover:border-white/[0.05]'}
                                    `}
                                    onClick={() => toggleItem(id)}
                                >
                                    <Checkbox
                                        id={id}
                                        checked={isSelected}
                                        onCheckedChange={() => toggleItem(id)}
                                        className="data-[state=checked]:bg-brand-primary border-white/20"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-black tracking-tight text-sm ${isSelected ? 'text-brand-primary' : 'text-white'}`}>
                                                !{trigger}
                                            </span>
                                            {isSelected && (
                                                <Badge variant="outline" className="text-[9px] px-1 h-4 border-brand-primary/20 text-brand-primary bg-brand-primary/5">
                                                    Selected
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-zinc-500 truncate mt-0.5 group-hover:text-zinc-400 transition-colors">
                                            {response}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            </div>

            <div className="flex items-center justify-between pt-2">
                <div className="text-sm font-medium text-zinc-400">
                    <span className="text-brand-primary font-bold">{state.selectedItems.size}</span> selected
                </div>
                <Button
                    onClick={handleMigrate}
                    disabled={isMigrating || state.selectedItems.size === 0}
                    size="lg"
                    className="bg-brand-primary hover:bg-brand-primary/90 text-white font-bold shadow-lg shadow-brand-primary/20 transition-all active:scale-95"
                >
                    {isMigrating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                    Start Migration
                </Button>
            </div>
        </div>
    );
}

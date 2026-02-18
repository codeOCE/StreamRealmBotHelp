"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Circle, ArrowRight, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface OnboardingStep {
    key: string;
    completed: boolean;
    label: string;
}

interface OnboardingStatus {
    steps: OnboardingStep[];
    progress: number;
    completed: boolean;
}

export function OnboardingChecklist() {
    const [status, setStatus] = useState<OnboardingStatus | null>(null);
    const [isVisible, setIsVisible] = useState(true);
    const [isLoading, setIsLoading] = useState(true);

    const fetchStatus = async () => {
        try {
            // Get current user and tenant ID
            const userRes = await fetch('/api/user/me', { credentials: 'include' });
            if (!userRes.ok) throw new Error("Failed to fetch user");
            const userData = await userRes.json();
            const tenantId = userData.tenantId;

            const res = await fetch(`/api/dashboard/onboarding/${tenantId}`);
            if (res.ok) {
                const data = await res.json();
                setStatus(data);

                // If completely done, maybe hide it? Or show a "Good Job" message.
                // For now, keep it visible until manually dismissed or if desired.
            }
        } catch (error) {
            console.error("Failed to fetch onboarding status", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    if (!isVisible || isLoading || !status) return null;

    if (status.completed) {
        // Optional: Don't show if fully completed? 
        // Or show a collapsed "All Systems Go" version.
        return null;
    }

    return (
        <Card className="glass-card border border-brand-primary/20 bg-slate-950/40 backdrop-blur-xl mb-12 relative overflow-hidden rounded-[2rem] shadow-2xl shadow-brand-primary/5">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand-primary shadow-[0_0_15px_rgba(var(--brand-primary-rgb),0.5)]" />
            <CardHeader className="p-8 pb-4 flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-xl font-black tracking-tighter flex items-center gap-3 uppercase italic text-white">
                        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 text-brand-primary not-italic">⚡</span>
                        Terminal Initialization
                        <span className="text-[10px] font-bold text-brand-primary ml-4 uppercase tracking-[0.2em] px-2 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/10 animate-pulse">
                            {status.progress}% Integrated
                        </span>
                    </CardTitle>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-zinc-500 hover:text-white hover:bg-white/5 rounded-xl border border-white/5"
                    onClick={() => setIsVisible(false)}
                >
                    <X className="h-5 w-5" />
                </Button>
            </CardHeader>
            <CardContent className="p-8 pt-4">
                <div className="w-full bg-white/5 h-1.5 rounded-full mb-8 overflow-hidden">
                    <div
                        className="bg-brand-primary h-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(var(--brand-primary-rgb),0.5)]"
                        style={{ width: `${status.progress}%` }}
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {status.steps.map((step) => (
                        <div
                            key={step.key}
                            className={cn(
                                "group relative flex flex-col gap-4 p-6 rounded-2xl border transition-all duration-300",
                                step.completed
                                    ? "bg-emerald-500/5 border-emerald-500/20 shadow-lg shadow-emerald-500/5"
                                    : "bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]"
                            )}
                        >
                            <div className="flex items-start justify-between">
                                <div className={cn(
                                    "p-2 rounded-lg border",
                                    step.completed
                                        ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                                        : "bg-white/5 border-white/10 text-zinc-500 group-hover:text-zinc-300"
                                )}>
                                    {step.completed ? (
                                        <CheckCircle2 className="h-5 w-5" />
                                    ) : (
                                        <Circle className="h-5 w-5" />
                                    )}
                                </div>
                                {!step.completed && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-zinc-500 hover:text-white hover:bg-brand-primary/20 rounded-lg group-hover:translate-x-1 transition-transform"
                                        asChild
                                    >
                                        <Link href={getLinkForStep(step.key)}>
                                            <ArrowRight className="h-4 w-4" />
                                        </Link>
                                    </Button>
                                )}
                            </div>

                            <div>
                                <p className={cn(
                                    "text-[10px] font-black uppercase tracking-widest mb-1",
                                    step.completed ? "text-emerald-500" : "text-zinc-500"
                                )}>
                                    {step.completed ? 'Protocol Online' : 'Awaiting Link'}
                                </p>
                                <p className={cn(
                                    "text-sm font-bold tracking-tight",
                                    step.completed ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"
                                )}>
                                    {step.label}
                                </p>
                            </div>

                            {step.completed && (
                                <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function getLinkForStep(key: string): string {
    switch (key) {
        case 'linked_bot': return '/dashboard/integrations';
        case 'created_command': return '/dashboard/commands';
        case 'enabled_moderation': return '/dashboard/moderation';
        case 'imported_commands': return '/dashboard/commands'; // Modal trigger ideally
        default: return '/dashboard';
    }
}

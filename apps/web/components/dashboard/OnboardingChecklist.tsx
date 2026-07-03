"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Circle, ArrowRight, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { DEV_USER, isDevSkipAuth } from "@/lib/dev-auth";

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
            let tenantId: string | undefined;
            const userRes = await fetch(apiUrl('/api/user/me'), { credentials: 'include' }).catch(() => null);
            if (userRes?.ok) {
                const userData = await userRes.json();
                tenantId = userData.tenantId ?? userData.id;
            } else if (isDevSkipAuth()) {
                tenantId = DEV_USER.tenantId;
            }
            if (!tenantId) return;

            const res = await fetch(apiUrl(`/api/dashboard/onboarding/${tenantId}`), { credentials: 'include' });
            if (res.ok) setStatus(await res.json());
        } catch {
            /* hide checklist when API unreachable */
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchStatus(); }, []);

    if (!isVisible || isLoading || !status || status.completed) return null;

    return (
        <div className="glass-card rounded-2xl border border-brand-primary/15 relative overflow-hidden">
            {/* Accent left bar */}
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-brand-primary" />

            <div className="px-6 py-5 flex items-center justify-between border-b border-white/5">
                <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary flex-shrink-0">
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white tracking-tight">Getting Started</h3>
                        <p className="text-[10px] font-black text-brand-primary  mt-0.5">{status.progress}% complete</p>
                    </div>
                </div>
                <button
                    onClick={() => setIsVisible(false)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-white hover:bg-white/8 transition-all"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Progress bar */}
            <div className="h-0.5 w-full bg-white/[0.03]">
                <div
                    className="h-full bg-brand-primary transition-all duration-1000 ease-out"
                    style={{ width: `${status.progress}%` }}
                />
            </div>

            <div className="p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {status.steps.map((step) => (
                    <div
                        key={step.key}
                        className={cn(
                            "group relative flex items-center gap-3 p-4 rounded-xl border transition-all duration-300",
                            step.completed
                                ? "bg-brand-primary/[0.06] border-brand-primary/20"
                                : "bg-white/[0.02] border-white/5 hover:border-brand-primary/30 hover:bg-white/[0.04]"
                        )}
                    >
                        <div className={cn(
                            "w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 transition-all duration-300",
                            step.completed
                                ? "bg-brand-primary/20 border-brand-primary/30 text-brand-primary"
                                : "bg-white/[0.04] border-white/8 text-zinc-600 group-hover:text-brand-primary group-hover:border-brand-primary/30"
                        )}>
                            {step.completed
                                ? <CheckCircle2 className="h-3.5 w-3.5" />
                                : <Circle className="h-3.5 w-3.5" />
                            }
                        </div>

                        <div className="flex-1 min-w-0">
                            <p className={cn(
                                "text-[10px] font-black  mb-0.5",
                                step.completed ? "text-brand-primary" : "text-zinc-600"
                            )}>
                                {step.completed ? 'Done' : 'To do'}
                            </p>
                            <p className={cn(
                                "text-xs font-black tracking-tight leading-tight",
                                step.completed ? "text-white" : "text-zinc-500 group-hover:text-zinc-300"
                            )}>
                                {step.label}
                            </p>
                        </div>

                        {!step.completed && (
                            <Link
                                href={getLinkForStep(step.key)}
                                className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/8 flex items-center justify-center text-zinc-600 hover:text-white hover:bg-brand-primary hover:border-brand-primary transition-all flex-shrink-0"
                            >
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        )}

                        {step.completed && (
                            <div className="w-2 h-2 rounded-full bg-brand-primary flex-shrink-0" />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function getLinkForStep(key: string): string {
    switch (key) {
        case 'linked_bot': return '/dashboard/integrations';
        case 'created_command': return '/dashboard/commands';
        case 'enabled_moderation': return '/dashboard/moderation';
        case 'imported_commands': return '/dashboard/commands';
        default: return '/dashboard';
    }
}

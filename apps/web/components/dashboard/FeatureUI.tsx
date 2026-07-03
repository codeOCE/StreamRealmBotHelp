"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/* Shared premium UI for feature dashboard pages — built on the Void design system. */

export function FeaturePage({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("feature-page space-y-8 max-w-7xl mx-auto", className)}>
            {children}
        </div>
    );
}

export function FeatureHeader({
    icon: Icon,
    title,
    subtitle,
    children,
}: {
    icon: LucideIcon;
    title: string;
    subtitle: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <header className="page-header !pb-6 !border-b-white/[0.06]">
            <div className="flex items-start gap-4 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-brand-primary" strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                    <h1 className="page-title font-heading">{title}</h1>
                    <p className="page-subtitle max-w-2xl">{subtitle}</p>
                </div>
            </div>
            {children && <div className="flex items-center gap-3 shrink-0">{children}</div>}
        </header>
    );
}

export function LiveBanner({
    icon: Icon,
    title,
    meta,
    action,
}: {
    icon: LucideIcon;
    title: string;
    meta: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <div className="live-banner">
            <div className="w-10 h-10 rounded-xl bg-brand-primary/15 border border-brand-primary/25 flex items-center justify-center shrink-0">
                <Icon className="w-4.5 h-4.5 text-brand-primary" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="live-dot shrink-0" aria-hidden />
                    <span className="text-[10px] font-black  text-emerald-400">Live</span>
                </div>
                <p className="text-sm font-black text-white truncate">{title}</p>
                <p className="text-[11px] text-zinc-500 font-medium mt-0.5">{meta}</p>
            </div>
            {action}
        </div>
    );
}

export function StatTile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
    return (
        <div className="stat-card holo-card">
            <p className="text-xs font-semibold text-zinc-400 mb-2">{label}</p>
            <div className="metric-value">{value}</div>
            {hint && <p className="text-xs text-zinc-600 font-medium mt-2">{hint}</p>}
        </div>
    );
}

export function Panel({
    title,
    children,
    className,
}: {
    title?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("bento-card p-7", className)}>
            {title && (
                <h3 className="text-sm font-bold text-zinc-300 mb-5 flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-brand-primary" />
                    {title}
                </h3>
            )}
            {children}
        </div>
    );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-zinc-400 ml-1">{label}</span>
            {children}
        </label>
    );
}

export function CommandChip({ children }: { children: React.ReactNode }) {
    return <code className="cmd-chip">{children}</code>;
}

const STATUS_STYLES: Record<string, string> = {
    open: "void-badge-green",
    closed: "void-badge-muted",
    drawn: "void-badge-blue",
    pending: "void-badge-muted",
    completed: "void-badge-green",
};

export function StatusPill({ status }: { status: string }) {
    return (
        <span className={cn("void-badge text-[9px] font-black ", STATUS_STYLES[status] ?? "void-badge-muted")}>
            {status}
        </span>
    );
}

type ChipVariant = "primary" | "amber" | "emerald" | "ghost";

export function ActionChip({
    children,
    variant = "ghost",
    className,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ChipVariant }) {
    return (
        <button
            type="button"
            className={cn(
                "action-chip",
                variant === "primary" && "action-chip-primary",
                variant === "amber" && "action-chip-amber",
                variant === "emerald" && "action-chip-emerald",
                variant === "ghost" && "action-chip-ghost",
                className,
            )}
            {...props}
        >
            {children}
        </button>
    );
}

export function DeleteButton({ onClick, label = "Delete" }: { onClick: () => void; label?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-zinc-600 hover:text-rose-400 hover:bg-rose-400/10 hover:border-rose-400/20 transition-all duration-200 cursor-pointer"
        >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
        </button>
    );
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
}: {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="empty-state bento-card !rounded-[2.5rem] col-span-full">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/8 flex items-center justify-center">
                <Icon className="w-7 h-7 text-zinc-600" strokeWidth={1.75} />
            </div>
            <div>
                <p className="text-base font-bold text-zinc-300">{title}</p>
                {description && <p className="text-sm text-zinc-600 font-medium mt-2 max-w-sm">{description}</p>}
            </div>
            {action}
        </div>
    );
}

export function ProgressRow({
    label,
    pct,
    count,
    leading,
}: {
    label: string;
    pct: number;
    count: number;
    leading?: boolean;
}) {
    return (
        <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
                <span className={cn("font-bold truncate pr-2", leading ? "text-brand-primary" : "text-zinc-300")}>{label}</span>
                <span className="text-zinc-500 font-black tabular-nums shrink-0">{pct}% · {count}</span>
            </div>
            <div className="progress-track">
                <div
                    className={cn("progress-fill", !leading && "progress-fill-muted")}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

export function WinnerModal({
    name,
    onDrawAnother,
    onClose,
}: {
    name: string;
    onDrawAnother: () => void;
    onClose: () => void;
}) {
    return (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bento-card bento-card-active !rounded-[2.5rem] p-12 text-center max-w-md w-full animate-in zoom-in-95 duration-300 glow-p"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
                    <svg className="w-8 h-8 text-brand-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                        <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
                        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                    </svg>
                </div>
                <p className="text-[10px] font-black  text-brand-primary mb-2">Winner</p>
                <h2 className="text-4xl font-black text-white mb-8 break-words">{name}</h2>
                <div className="flex gap-3 justify-center">
                    <ActionChip variant="ghost" onClick={onDrawAnother}>Draw another</ActionChip>
                    <button type="button" onClick={onClose} className="saas-button">Done</button>
                </div>
            </div>
        </div>
    );
}

export function SectionLabel({
    children,
    action,
}: {
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-zinc-400 shrink-0">{children}</span>
            <div className="h-px flex-1 bg-white/5" />
            {action}
        </div>
    );
}

export function LoadingGrid({ cols = 2 }: { cols?: 2 | 3 }) {
    const gridClass = cols === 3 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 lg:grid-cols-2';
    const count = cols === 3 ? 3 : 2;
    return (
        <div className={cn('grid gap-6', gridClass)}>
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="bento-card p-7"><div className="skeleton h-44 w-full rounded-xl" /></div>
            ))}
        </div>
    );
}

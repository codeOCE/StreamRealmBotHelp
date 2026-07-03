'use client';

import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Download, Play, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

export interface InteractionCardProps {
    title: string;
    description: string;
    rating: number;
    price: string | number; // 'Free' or 450 (Credits)
    imageUrl?: string;
    isInstalled?: boolean;
    isNew?: boolean;
    isPro?: boolean;
    comingSoon?: boolean;
    onAction?: () => void;
}

export function InteractionCard({
    title,
    description,
    rating,
    price,
    imageUrl,
    isInstalled = false,
    isNew = false,
    isPro = false,
    comingSoon = false,
    onAction
}: InteractionCardProps) {
    return (
        <div className={cn(
            "matrix-card group flex flex-col h-full border-2 transition-all",
            comingSoon ? "opacity-60" : "hover:bg-brand-primary/5",
        )}>
            <div className="relative h-44 w-full bg-black overflow-hidden border-b border-brand-primary/20">
                <div className="scanline opacity-10 group-hover:opacity-30 transition-opacity" />
                {imageUrl ? (
                    <Image
                        src={imageUrl}
                        alt={title}
                        fill
                        className="object-cover opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-brand-primary/10">
                        <div className="w-16 h-16 border-2 border-brand-primary/20 border-dashed animate-spin-slow" />
                        <Zap className="absolute w-8 h-8 text-brand-primary/20 group-hover:text-brand-primary transition-colors" />
                    </div>
                )}

                {/* Status Tags */}
                <div className="absolute top-0 right-0 flex">
                    {isNew && (
                        <span className="px-3 py-1 bg-brand-secondary text-black text-[8px] font-black ">
                            New
                        </span>
                    )}
                    {isPro && (
                        <span className="px-3 py-1 bg-brand-primary text-black text-[8px] font-black ">
                            Pro
                        </span>
                    )}
                </div>

                <div className="absolute bottom-2 left-2 flex items-center gap-1.5 text-brand-primary font-black text-[8px] bg-black/80 px-2 py-0.5 border border-brand-primary/20">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    <span>{rating.toFixed(1)}</span>
                </div>
            </div>

            <div className="p-6 space-y-4 flex-1 flex flex-col relative z-10">
                <div className="space-y-1">
                    <h3 className="text-lg font-black text-white  group-hover:text-brand-primary transition-colors leading-none">
                        {title}
                    </h3>
                    <div className="h-[1px] w-8 bg-brand-primary/40 group-hover:w-full transition-all duration-500" />
                </div>

                <p className="text-[9px] text-brand-primary/40 font-bold  line-clamp-2 leading-relaxed">
                    {description}
                </p>

                <div className="pt-6 mt-auto border-t border-brand-primary/10 flex items-center justify-between">
                    <div className="font-black text-[8px] ">
                        {price === 'Free' ? (
                            <span className="text-brand-primary">Free</span>
                        ) : (
                            <span className="text-white">{price} <span className="text-brand-primary/40">Credits</span></span>
                        )}
                    </div>

                    <button
                        onClick={comingSoon ? undefined : onAction}
                        disabled={comingSoon}
                        className={cn(
                            "px-5 py-2 text-[9px] font-black  transition-all",
                            comingSoon
                                ? "bg-white/[0.02] border border-white/10 text-zinc-600 cursor-not-allowed"
                                : isInstalled
                                    ? "bg-brand-primary/5 border border-brand-primary/20 text-brand-primary/40 hover:bg-brand-primary hover:text-black hover:border-brand-primary"
                                    : "matrix-btn py-2"
                        )}
                    >
                        {comingSoon ? (
                            <span>Coming Soon</span>
                        ) : isInstalled ? (
                            <span className="flex items-center gap-2">
                                <Play className="w-2.5 h-2.5 fill-current" /> Open
                            </span>
                        ) : (
                            <span>{typeof price === 'number' ? 'Buy' : 'Install'}</span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

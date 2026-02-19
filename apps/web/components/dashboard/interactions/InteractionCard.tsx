'use client';

import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Download, Play } from 'lucide-react';
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
    onAction
}: InteractionCardProps) {
    return (
        <Card className="overflow-hidden hover:border-primary/50 transition-all duration-300 group flex flex-col h-full bg-card/50 backdrop-blur-sm">
            <div className="relative h-40 w-full bg-muted/50 overflow-hidden">
                {imageUrl ? (
                    <Image
                        src={imageUrl}
                        alt={title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground/20">
                        <div className="w-12 h-12 rounded-full border-2 border-current border-dashed" />
                    </div>
                )}

                {/* Badges */}
                <div className="absolute top-2 right-2 flex gap-2">
                    {isNew && <Badge className="bg-blue-600 hover:bg-blue-700">NEW</Badge>}
                    {isPro && <Badge className="bg-purple-600 hover:bg-purple-700">PRO</Badge>}
                </div>
            </div>

            <CardContent className="p-4 flex-1">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">
                        {title}
                    </h3>
                    <div className="flex items-center gap-1 text-yellow-500 text-xs font-medium">
                        <Star className="w-3 h-3 fill-current" />
                        <span>{rating.toFixed(1)}</span>
                    </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                    {description}
                </p>
            </CardContent>

            <CardFooter className="p-4 pt-0 flex items-center justify-between mt-auto">
                <div className="font-semibold text-sm">
                    {price === 'Free' ? (
                        <span className="text-green-500">Free</span>
                    ) : (
                        <span>{price} <span className="text-muted-foreground text-xs font-normal">Credits</span></span>
                    )}
                </div>

                <Button
                    size="sm"
                    variant={isInstalled ? "secondary" : "default"}
                    onClick={onAction}
                    className="gap-2"
                >
                    {isInstalled ? (
                        <>
                            <Play className="w-3 h-3" />
                            Open
                        </>
                    ) : (
                        <>
                            {typeof price === 'number' ? 'Purchase' : 'Install'}
                        </>
                    )}
                </Button>
            </CardFooter>
        </Card>
    );
}

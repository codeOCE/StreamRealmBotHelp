'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Gamepad2, BarChart3 } from 'lucide-react';
import { InteractionCard } from '@/components/dashboard/interactions/InteractionCard';

// Marketplace catalog. Modules with an `href` are built and navigate to their
// management page; everything else renders as a disabled "Coming Soon" card.
const MODULES = [
    {
        id: 'bingo',
        title: 'Stream Bingo',
        description: 'Set the tiles — viewers generate their own cards and mark them live as you call.',
        rating: 4.9,
        price: 'Free',
        category: 'mini-games',
        isInstalled: true,
        href: '/dashboard/bingo',
    },
    {
        id: 'wheel',
        title: 'Wheel Spin',
        description: 'Configure a prize wheel and spin it live on stream with a real-time OBS overlay.',
        rating: 4.8,
        price: 'Free',
        category: 'mini-games',
        isInstalled: true,
        href: '/dashboard/wheel',
    },
    {
        id: 'win-loss-draw',
        title: 'Win / Loss / Draw',
        description: 'A fully customizable session record scoreboard overlay for OBS.',
        rating: 4.7,
        price: 'Free',
        category: 'visual-fx',
        isInstalled: true,
        href: '/dashboard/win-loss-draw',
    },
    {
        id: 'battles',
        title: 'Viewer Battles',
        description: 'Allow chatters to challenge each other to RNG rolls with persistent MMR tracking.',
        rating: 4.8,
        price: 'Free',
        category: 'mini-games',
        isInstalled: true,
        imageUrl: '/images/modules/battles.jpg' // Would need real assets
    },
    {
        id: 'chaos-vote',
        title: 'Chaos Crowd Vote',
        description: 'Let your audience control game events with real-time voting. Support for 50+ titles.',
        rating: 4.9,
        price: 'Free',
        category: 'polls',
        isNew: true,
        isPro: true
    },
    {
        id: 'pixel-pet',
        title: 'Pixel Pet Petting',
        description: 'Interactive desktop pet that viewers can feed and pet through chat commands.',
        rating: 4.9,
        price: 'Free',
        category: 'mini-games'
    },
    {
        id: 'synthwave',
        title: 'Synthwave Visuals',
        description: 'Dynamic audio-reactive background visuals that respond to your stream music.',
        rating: 4.8,
        price: 900,
        category: 'visual-fx',
        isPro: true
    },
    {
        id: 'marathons',
        title: 'Sub-Goal Marathons',
        description: 'Automated countdown timer that increases with every sub or donation.',
        rating: 4.7,
        price: 'Free',
        category: 'visual-fx'
    },
    {
        id: 'rpg-slayers',
        title: 'Streamer Slayers',
        description: 'Chat RPG where viewers level up by attacking a virtual boss on your overlay.',
        rating: 5.0,
        price: 1200,
        category: 'mini-games',
        isNew: true
    },
    {
        id: 'soundboard',
        title: 'Meme Soundboard',
        description: 'Allow your viewers to trigger funny sound effects during your broadcast.',
        rating: 4.5,
        price: 'Free',
        category: 'sound-alerts'
    },
    {
        id: 'chat-canvas',
        title: 'Chat Canvas',
        description: 'A shared canvas where viewers can draw pixels simultaneously via chat coordinates.',
        rating: 4.9,
        price: 'Free',
        category: 'mini-games'
    },
    {
        id: 'ai-lighting',
        title: 'AI Mood Lighting',
        description: 'Sync your physical smart lights with the intensity and mood of your gameplay.',
        rating: 5.0,
        price: 2000,
        category: 'integrations',
        isPro: true
    }
];

const CATEGORIES = [
    { id: 'all', label: 'All Tools' },
    { id: 'mini-games', label: 'Mini-Games' },
    { id: 'sound-alerts', label: 'Sound Alerts' },
    { id: 'visual-fx', label: 'Visual FX' },
    { id: 'polls', label: 'Polls & Betting' },
    { id: 'integrations', label: 'Integrations' }
];

export default function InteractionsPage() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [activeTab, setActiveTab] = useState('market'); // 'market' | 'library'

    // A module is "real" (installable/usable today) only if it has a management
    // page to navigate to. Everything else is gated as Coming Soon for launch.
    const isReal = (mod: { href?: string }) => Boolean(mod.href);

    const filteredModules = MODULES.filter(mod => {
        const matchesCategory = selectedCategory === 'all' || mod.category === selectedCategory;
        const matchesSearch = mod.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            mod.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTab = activeTab === 'library' ? isReal(mod) : true;

        return matchesCategory && matchesSearch && matchesTab;
    });

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 flex-wrap">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-white font-heading">Interactions</h1>
                    <p className="text-brand-muted text-sm font-medium mt-1">Community tools and mini-games for your stream.</p>
                </div>
                <div className="relative w-full md:w-80">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        placeholder="Search tools..."
                        className="void-input pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Featured */}
            {activeTab === 'market' && selectedCategory === 'all' && !searchQuery && (
                <div className="matrix-card border-2 p-0 group overflow-hidden">
                    <div className="scanline opacity-20" />
                    <div className="relative z-10 p-12 md:p-16 flex flex-col md:flex-row gap-16 items-center">
                        <div className="flex-1 space-y-12">
                            <div className="flex items-center gap-4">
                                <span className="px-4 py-1 rounded-lg bg-brand-primary text-background text-[9px] font-black ">FEATURED</span>
                                <div className="h-[1px] flex-1 bg-brand-primary/20" />
                            </div>
                            <div className="space-y-6">
                                <h2 className="text-5xl md:text-7xl font-black text-white tracking-tight uppercase leading-none font-display">
                                    Chaos <span className="text-brand-primary">Vote</span>
                                </h2>
                                <p className="text-base text-zinc-400 font-medium leading-relaxed max-w-2xl">
                                    Let your audience control game events with real-time voting. Support for 50+ titles.
                                </p>
                            </div>
                            <div className="flex gap-6">
                                <button
                                    disabled
                                    className="text-[10px] tracking-[0.15em] rounded-xl px-8 py-3 bg-white/[0.02] border border-white/10 text-zinc-600 font-black uppercase cursor-not-allowed"
                                >
                                    Coming Soon
                                </button>
                            </div>
                        </div>
                        <div className="hidden lg:flex w-72 h-72 border border-brand-primary/10 bg-brand-primary/[0.02] items-center justify-center relative overflow-hidden group-hover:border-brand-primary/30 transition-all duration-700">
                            <div className="absolute inset-0 bg-brand-primary opacity-0 group-hover:opacity-5 transition-opacity" />
                            <Gamepad2 className="w-32 h-32 text-brand-primary/5 group-hover:text-brand-primary/10 transition-all duration-700" />
                            <div className="absolute top-4 left-4 text-[8px] text-brand-primary/20 font-black tracking-widest">Preview</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tools grid */}
            <div className="space-y-12">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10">
                    <div className="flex flex-wrap gap-2">
                        {CATEGORIES.map(category => (
                            <button
                                key={category.id}
                                onClick={() => setSelectedCategory(category.id)}
                                className={cn(
                                    "px-5 py-2 rounded-xl border transition-colors duration-150 text-[10px] font-black  cursor-pointer",
                                    selectedCategory === category.id
                                        ? "bg-brand-primary text-background border-brand-primary shadow-glow-p"
                                        : "bg-white/[0.02] text-zinc-500 border-white/5 hover:text-white hover:bg-white/[0.05]"
                                )}
                            >
                                {category.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex bg-white/[0.03] border border-white/5 rounded-2xl p-1">
                        <button
                            onClick={() => setActiveTab('market')}
                            className={cn(
                                "px-6 py-2 rounded-xl text-[10px] font-black transition-colors duration-150  cursor-pointer",
                                activeTab === 'market' ? "bg-brand-primary text-background shadow-glow-p" : "text-zinc-500 hover:text-white"
                            )}
                        >
                            Marketplace
                        </button>
                        <button
                            onClick={() => setActiveTab('library')}
                            className={cn(
                                "px-6 py-2 rounded-xl text-[10px] font-black transition-colors duration-150  cursor-pointer",
                                activeTab === 'library' ? "bg-brand-primary text-background shadow-glow-p" : "text-zinc-500 hover:text-white"
                            )}
                        >
                            Installed
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredModules.map(module => {
                        const href = (module as { href?: string }).href;

                        // Real, installed features navigate to their own management page.
                        if (href) {
                            return (
                                <div
                                    key={module.id}
                                    onClick={() => router.push(href)}
                                    className="cursor-pointer h-full"
                                >
                                    <InteractionCard
                                        title={module.title}
                                        description={module.description}
                                        rating={module.rating}
                                        price={module.price}
                                        isNew={module.isNew}
                                        isPro={module.isPro}
                                        isInstalled={module.isInstalled}
                                        onAction={() => router.push(href)}
                                    />
                                </div>
                            );
                        }

                        // Not yet built — show as a disabled "Coming Soon" card.
                        return (
                            <div key={module.id} className="h-full">
                                <InteractionCard
                                    title={module.title}
                                    description={module.description}
                                    rating={module.rating}
                                    price={module.price}
                                    isNew={module.isNew}
                                    isPro={module.isPro}
                                    comingSoon
                                />
                            </div>
                        );
                    })}
                </div>

                {activeTab === 'library' && filteredModules.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-brand-primary/10 bg-brand-primary/[0.01] text-center gap-10 group">
                        <div className="w-20 h-20 border border-brand-primary/20 flex items-center justify-center opacity-20 group-hover:opacity-100 group-hover:border-brand-primary transition-all duration-700">
                            <BarChart3 className="w-10 h-10 text-brand-primary" />
                        </div>
                        <div className="space-y-6">
                            <p className="text-zinc-600 text-[10px] font-black ">No tools installed yet</p>
                            <button
                                onClick={() => setActiveTab('market')}
                                className="text-brand-primary font-black text-[10px]  border-b border-brand-primary/40 pb-1 hover:text-white hover:border-white transition-all"
                            >
                                Browse Marketplace →
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

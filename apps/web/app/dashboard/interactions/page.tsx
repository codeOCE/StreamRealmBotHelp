'use client';

import { useState } from 'react';
import { Search, Filter, ShoppingCart, Zap, Gamepad2, Mic2, BarChart3, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { InteractionCard } from '@/components/dashboard/interactions/InteractionCard';
import { BattleModule } from '@/components/dashboard/interactions/BattleModule';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

// Mock Data
const MODULES = [
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
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [activeTab, setActiveTab] = useState('market'); // 'market' | 'library'

    const filteredModules = MODULES.filter(mod => {
        const matchesCategory = selectedCategory === 'all' || mod.category === selectedCategory;
        const matchesSearch = mod.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            mod.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTab = activeTab === 'library' ? mod.isInstalled : true;

        return matchesCategory && matchesSearch && matchesTab;
    });

    return (
        <div className="container mx-auto p-6 space-y-8 min-h-screen">
            {/* Header / Nav */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                        Interaction Market
                    </h1>
                    <p className="text-muted-foreground">Discover new ways to engage your community</p>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search for mini-games, alerts, or effects..."
                            className="pl-9 bg-secondary/50 border-0 ring-offset-0 focus-visible:ring-1 focus-visible:ring-primary"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Button variant="ghost" size="icon">
                        <ShoppingCart className="h-5 w-5" />
                    </Button>
                </div>
            </div>

            {/* Featured Banner (Only show in Market 'all' view) */}
            {activeTab === 'market' && selectedCategory === 'all' && !searchQuery && (
                <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 border border-white/10 shadow-2xl">
                    <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-10" />
                    <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row gap-8 items-center">
                        <div className="flex-1 space-y-6">
                            <Badge className="bg-white/10 hover:bg-white/20 text-white border-0 backdrop-blur-md px-4 py-1.5">
                                FEATURED TOOL OF THE MONTH
                            </Badge>
                            <div>
                                <h2 className="text-4xl md:text-5xl font-black text-white mb-2">
                                    Chaos Crowd Vote
                                </h2>
                                <p className="text-lg text-slate-300 max-w-xl leading-relaxed">
                                    Let your audience directly control your game events with real-time voting.
                                    Support for over 50+ popular titles including RPGs and FPS.
                                </p>
                            </div>
                            <div className="flex gap-4">
                                <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 shadow-lg shadow-purple-900/50">
                                    Install Now
                                </Button>
                                <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10">
                                    View Demo
                                </Button>
                            </div>
                        </div>
                        {/* Abstract Visual / Image Placeholder */}
                        <div className="hidden md:block w-96 h-64 bg-slate-800/50 rounded-xl backdrop-blur-sm border border-white/10 shadow-inner flex items-center justify-center">
                            <Gamepad2 className="w-24 h-24 text-white/20" />
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div className="space-y-6">
                <Tabs defaultValue="market" onValueChange={setActiveTab} className="w-full">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div className="flex flex-wrap gap-2">
                            {CATEGORIES.map(category => (
                                <Button
                                    key={category.id}
                                    variant={selectedCategory === category.id ? 'default' : 'secondary'}
                                    size="sm"
                                    onClick={() => setSelectedCategory(category.id)}
                                    className="rounded-full px-4 transition-all"
                                >
                                    {category.label}
                                </Button>
                            ))}
                        </div>

                        <TabsList className="bg-secondary/50">
                            <TabsTrigger value="market">Market</TabsTrigger>
                            <TabsTrigger value="library">My Library</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="market" className="mt-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredModules.map(module => (
                                <Dialog key={module.id}>
                                    <DialogTrigger asChild>
                                        <div className="cursor-pointer h-full">
                                            <InteractionCard
                                                title={module.title}
                                                description={module.description}
                                                rating={module.rating}
                                                price={module.price}
                                                isNew={module.isNew}
                                                isPro={module.isPro}
                                                isInstalled={module.isInstalled}
                                                onAction={() => { }} // Placeholder
                                            />
                                        </div>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                                        {/* If it's the Battles module, show the actual component */}
                                        {module.id === 'battles' ? (
                                            <div className="p-4">
                                                <div className="flex items-center gap-4 mb-6">
                                                    <div className="w-16 h-16 bg-primary/20 rounded-lg flex items-center justify-center">
                                                        <Zap className="w-8 h-8 text-primary" />
                                                    </div>
                                                    <div>
                                                        <h2 className="text-2xl font-bold">{module.title}</h2>
                                                        <p className="text-muted-foreground">Installed • v1.2.0</p>
                                                    </div>
                                                </div>
                                                <BattleModule />
                                            </div>
                                        ) : (
                                            <div className="p-12 text-center space-y-4">
                                                <div className="w-24 h-24 bg-muted rounded-full mx-auto flex items-center justify-center">
                                                    <Plus className="w-12 h-12 text-muted-foreground" />
                                                </div>
                                                <h2 className="text-2xl font-bold">Module Details: {module.title}</h2>
                                                <p>This is where detailed screenshots, configuration options, and documentation would live.</p>
                                                <Button>Install Module</Button>
                                            </div>
                                        )}
                                    </DialogContent>
                                </Dialog>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="library" className="mt-0">
                        {filteredModules.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {filteredModules.map(module => (
                                    <Dialog key={module.id}>
                                        <DialogTrigger asChild>
                                            <div className="cursor-pointer h-full">
                                                <InteractionCard
                                                    title={module.title}
                                                    description={module.description}
                                                    rating={module.rating}
                                                    price={module.price}
                                                    isNew={module.isNew}
                                                    isPro={module.isPro}
                                                    isInstalled={module.isInstalled}
                                                    onAction={() => { }}
                                                />
                                            </div>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                                            {module.id === 'battles' ? (
                                                <div className="p-4">
                                                    <h2 className="text-2xl font-bold mb-4">{module.title}</h2>
                                                    <BattleModule />
                                                </div>
                                            ) : (
                                                <div className="p-8 text-center">Config placeholder</div>
                                            )}
                                        </DialogContent>
                                    </Dialog>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-20 bg-muted/20 rounded-xl border border-dashed">
                                <p className="text-muted-foreground">You haven't installed any modules yet.</p>
                                <Button variant="link" onClick={() => setActiveTab('market')}>Browse Store</Button>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

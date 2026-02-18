'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const justConnected = urlParams.get('connected') === 'true';

        fetch('/api/user/me', { credentials: 'include' })
            .then(res => {
                if (res.ok) return res.json();
                if (res.status === 401 && !justConnected) {
                    // Not logged in, redirect to login via proxied path
                    // Only redirect if we didn't JUST come back from a successful auth
                    window.location.href = '/auth/twitch';
                    return null;
                }
                return null;
            })
            .then(data => {
                if (data) setUser(data);
            })
            .catch(err => console.error('Failed to fetch user:', err));
    }, []);

    return (
        <div className="flex h-screen bg-background text-foreground font-sans selection:bg-brand-primary/30">
            {/* Sidebar */}
            <aside className="w-64 flex flex-col bg-surface-base border-r border-white-[0.05] z-30">
                <div className="h-16 flex items-center px-6 border-b border-white/[0.05]">
                    <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center shadow-lg shadow-brand-primary/20">
                        <span className="text-white font-black text-lg">S</span>
                    </div>
                    <div className="ml-3">
                        <h2 className="text-sm font-black tracking-tight leading-none text-white">Stream<span className="text-brand-primary">Realm</span></h2>
                        <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-[0.1em] mt-1">Creator Hub</p>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    <SidebarItem href="/dashboard" icon="📊" label="Dashboard" active />
                    <SidebarItem href="/dashboard/intel" icon="📈" label="Intel HUD" />
                    <SidebarItem href="/dashboard/sentinel" icon="👁️" label="Sentinel" />
                    <SidebarItem href="/dashboard/commands" icon="⌨️" label="Chat Commands" />
                    <SidebarItem href="/dashboard/moderation" icon="🛡️" label="Bot Filters" />
                    <SidebarItem href="/dashboard/timers" icon="⏱️" label="Timers" />
                    <SidebarItem href="/dashboard/loyalty" icon="🏆" label="Loyalty" />
                    <SidebarItem href="/dashboard/interactions" icon="⚔️" label="Interactions" />
                    <SidebarItem href="/dashboard/overlays" icon="🎨" label="Overlays" />
                    <SidebarItem href="/dashboard/tools" icon="🛠️" label="Tools & Utilities" />
                </nav>

                <div className="p-4 border-t border-white/[0.05] space-y-4">
                    <SidebarItem href="/dashboard/settings" icon="⚙️" label="Settings" />

                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10">
                            <img
                                src={user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=guest'}
                                alt="Avatar"
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white truncate">{user?.username || 'Loading...'}</p>
                            <p className="text-[9px] text-zinc-500 font-bold uppercase truncate">Streamer</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0 relative">
                {/* Topbar */}
                <header className="h-16 flex items-center justify-between px-8 bg-surface-base border-b border-white/[0.05] z-20">
                    <div className="flex items-center gap-6 flex-1 max-w-xl">
                        <div className="relative flex-1 group">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">🔍</span>
                            <input
                                type="text"
                                placeholder="Search commands, timers..."
                                className="w-full bg-white/[0.03] border border-white/[0.05] rounded-lg py-2 pl-10 pr-4 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-primary/40 focus:bg-white/[0.05] transition-all placeholder:text-zinc-600"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <a
                            href="/dashboard/integrations"
                            className="bg-brand-primary text-white font-bold text-xs px-5 py-2 rounded-lg hover:bg-brand-primary/80 transition-all shadow-lg shadow-brand-primary/20 flex items-center gap-2"
                        >
                            <span className="text-sm">🤖</span>
                            Link Bot
                        </a>
                        <button className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.05] text-zinc-400 hover:text-white transition-all text-sm">
                            🔔
                        </button>
                    </div>
                </header>

                {/* Content Area */}
                <main className="flex-1 overflow-y-auto overflow-x-hidden p-8 custom-scrollbar bg-[#020617] relative">
                    <div className="max-w-[1200px] mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}

function SidebarItem({ href, icon, label, active = false }: { href: string, icon: string, label: string, active?: boolean }) {
    return (
        <Link
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-xs font-bold ${active
                ? 'bg-brand-primary/10 text-brand-primary'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.03]'
                }`}
            aria-current={active ? 'page' : undefined}
        >
            <span className={`text-base ${active ? '' : 'opacity-60 grayscale'}`}>{icon}</span>
            <span>{label}</span>
            {active && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-primary shadow-[0_0_8px_rgba(0,163,255,0.6)]" />
            )}
        </Link>
    );
}

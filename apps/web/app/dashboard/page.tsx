import React from 'react';

export default function DashboardPage() {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col gap-2 border-l-4 border-brand-primary pl-6 py-2">
                <h1 className="text-3xl font-black tracking-tight text-white uppercase">Control Center</h1>
                <p className="text-zinc-500 text-sm font-bold tracking-wide">Real-time channel metrics and operational status.</p>
            </div>

            {/* Analytics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Active Viewers" value="1,284" change="+12%" icon="👥" trend="up" />
                <StatCard title="Chat Frequency" value="42 m/min" change="+5%" icon="💬" trend="up" />
                <StatCard title="Session XP" value="84.2k" change="-2%" icon="✨" trend="down" />
                <StatCard title="Uptime" value="04h 12m" change="Ongoing" icon="🕒" trend="up" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Live Services */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="font-black text-xs uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                            Live Service Status
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <OperationCard
                            title="Moderation Engine"
                            status="Active"
                            description="Scanning chat for prohibited content and spam patterns."
                            icon="🛡️"
                        />
                        <OperationCard
                            title="Loyalty Pipeline"
                            status="Syncing"
                            description="Processing viewer XP and point rewards in real-time."
                            icon="💎"
                        />
                        <OperationCard
                            title="Automation Timers"
                            status="Pending"
                            description="3 timers scheduled for broadcast in the next 15m."
                            icon="⏱️"
                        />
                        <OperationCard
                            title="Command Registry"
                            status="Ready"
                            description="124 active triggers loaded into local memory."
                            icon="⚡"
                        />
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="space-y-6">
                    <h3 className="font-black text-xs uppercase tracking-[0.2em] text-zinc-500 px-2">Activity Feed</h3>
                    <div className="glass-card rounded-2xl border border-white/[0.05] divide-y divide-white/[0.05] overflow-hidden">
                        <ActivityItem user="vancy_coder" action="followed" time="2m ago" />
                        <ActivityItem user="stream_legend" action="subscribed" time="5m ago" />
                        <ActivityItem user="bit_master" action="cheered 100 bits" time="12m ago" />
                        <ActivityItem user="chat_ninja" action="timed out" time="15m ago" />
                        <ActivityItem user="bot_helper" action="updated !rules" time="18m ago" />
                        <div className="p-4 bg-white/[0.02] text-center">
                            <button className="text-[10px] font-bold uppercase tracking-widest text-brand-primary hover:text-brand-primary/80 transition-colors">View All Events</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, change, icon, trend }: { title: string, value: string, change: string, icon: string, trend: 'up' | 'down' }) {
    return (
        <div className="glass-card rounded-xl p-6 border border-white/[0.05] hover:border-brand-primary/20 transition-all group overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 text-3xl opacity-10 group-hover:scale-110 transition-transform">{icon}</div>
            <p className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.15em] mb-4">{title}</p>
            <div className="flex items-end gap-4 relative z-10">
                <p className="text-3xl font-black tracking-tighter text-white">{value}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border mb-1 ${trend === 'up' ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                    {change}
                </span>
            </div>
        </div>
    );
}

function OperationCard({ title, status, description, icon }: { title: string, status: string, description: string, icon: string }) {
    return (
        <div className="glass-card rounded-xl p-5 border border-white/[0.05] hover:border-brand-primary/20 transition-all flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center text-xl shrink-0">
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold text-xs tracking-tight text-white uppercase">{title}</h4>
                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${status === 'Active' || status === 'Ready' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-brand-primary/10 text-brand-primary border border-brand-primary/20'}`}>
                        {status}
                    </span>
                </div>
                <p className="text-[10px] text-zinc-500 font-bold leading-relaxed line-clamp-2">{description}</p>
            </div>
        </div>
    );
}

function ActivityItem({ user, action, time }: { user: string, action: string, time: string }) {
    return (
        <div className="p-4 flex items-center justify-between group hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-primary opacity-40 group-hover:opacity-100 transition-opacity" />
                <p className="text-xs">
                    <span className="font-black text-white">{user}</span>
                    <span className="text-zinc-500 ml-1.5 font-bold">{action}</span>
                </p>
            </div>
            <span className="text-[9px] font-bold text-zinc-600 uppercase tabular-nums">{time}</span>
        </div>
    );
}

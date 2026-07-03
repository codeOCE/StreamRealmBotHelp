'use client';

import { OnboardingChecklist } from '@/components/dashboard/OnboardingChecklist';
import { DashboardMetrics, useDashboardActivity, timeAgo, ACTIVITY_COLORS } from '@/components/dashboard/DashboardMetrics';
import { FeatureHeader, FeaturePage, SectionLabel } from '@/components/dashboard/FeatureUI';
import {
  Clock, Download, Layers, LayoutDashboard, Terminal,
  Heart, Star, Gem, Users, CircleDollarSign, type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  follow: Heart,
  subscribe: Star,
  cheer: Gem,
  raid: Users,
  donation: CircleDollarSign,
};

const quickActions = [
  { label: 'New Command', icon: Terminal, href: '/dashboard/commands' },
  { label: 'New Timer', icon: Clock, href: '/dashboard/timers' },
  { label: 'New Overlay', icon: Layers, href: '/dashboard/overlays' },
  { label: 'Import Commands', icon: Download, href: '/dashboard/commands' },
];

export default function DashboardPage() {
  const { activity, loading: activityLoading } = useDashboardActivity();

  return (
    <FeaturePage>
      <FeatureHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle="Welcome back — here's what's happening with your stream."
      />

      <OnboardingChecklist />

      <DashboardMetrics />

      <div className="space-y-4">
        <SectionLabel>Recent Activity</SectionLabel>
        <div className="bento-card !rounded-2xl overflow-hidden !p-0">
          {activityLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : activity.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <p className="text-[11px] text-zinc-600 font-medium">No activity yet.</p>
              <p className="text-[10px] text-zinc-700 mt-1">Follows, subs, tips, and raids from the last 12 months show here.</p>
            </div>
          ) : (
            activity.map((item, i) => {
              const color = ACTIVITY_COLORS[item.type] || '#3faaff';
              const Icon = ACTIVITY_ICONS[item.type] || CircleDollarSign;
              return (
                <div
                  key={`${item.at}-${i}`}
                  className="flex items-center gap-3.5 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors duration-150 group"
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: `${color}1f`, color }}
                  >
                    <Icon className="w-[18px] h-[18px]" strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] leading-snug truncate">
                      <span className="text-white font-bold group-hover:text-brand-primary transition-colors">{item.user}</span>
                      <span className="text-zinc-500 ml-1.5">{item.action}</span>
                    </p>
                  </div>
                  <span className="text-[10px] text-zinc-600 font-semibold tabular-nums flex-shrink-0">{timeAgo(item.at)}</span>
                </div>
              );
            })
          )}
          <Link
            href="/dashboard/tips"
            className="block w-full px-5 py-3.5 text-[10px] font-black  text-brand-primary hover:text-white hover:bg-white/[0.02] transition-colors duration-150 border-t border-white/[0.04] text-center"
          >
            View Tips
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className="bento-card !rounded-xl p-4 flex items-center gap-3 group cursor-pointer hover:!border-brand-primary/25"
            >
              <span className="text-brand-primary/50 group-hover:text-brand-primary transition-colors flex-shrink-0">
                <Icon className="w-4 h-4" strokeWidth={2.25} />
              </span>
              <span className="text-[11px] font-black text-zinc-500 group-hover:text-white transition-colors ">{action.label}</span>
            </Link>
          );
        })}
      </div>
    </FeaturePage>
  );
}

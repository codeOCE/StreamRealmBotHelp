import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    default: "Castle Vault — Custom Twitch Emotes",
    template: "%s | Castle Vault",
  },
  description:
    "Browse free custom Twitch emotes shared by Creator Castle streamers — animated, static, and overlay emotes, searchable by name and tag.",
};

export default function EmotesSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/5 sticky top-0 z-50 backdrop-blur-md bg-black/40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-2xl">🏰</span>
            <span className="font-black text-white font-heading tracking-tight">Castle Vault</span>
          </Link>
          <a
            href="https://app.creatorcastle.gg/dashboard/emotes"
            className="text-xs font-black uppercase tracking-wide text-zinc-400 hover:text-white transition-colors"
          >
            Manage your emotes →
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>

      <footer className="border-t border-white/5 mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-xs text-zinc-600">
          Powered by{" "}
          <a href="https://creatorcastle.gg" className="text-brand-primary hover:underline">
            Creator Castle
          </a>
        </div>
      </footer>
    </div>
  );
}

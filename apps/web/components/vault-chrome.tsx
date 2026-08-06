import Link from "next/link";
import { VaultUserMenu } from "@/components/vault-user-menu";

/**
 * App shell for Castle Vault (emotes.creatorcastle.gg) — its own standalone
 * 7TV-style app, not a dashboard tab. Mirrors the dashboard shell's chrome
 * (fixed blur navbar, glowing logo box, ambient glow + matrix-grid, 1600px
 * container) but carries its own nav (Emotes / Studio) and an auth-aware corner.
 */
export function VaultChrome({
  children,
  active = "emotes",
}: {
  children: React.ReactNode;
  active?: "emotes" | "studio" | "admin";
}) {
  return (
    <>
      {/* Ambient background layers — identical to the dashboard shell */}
      <div className="saas-bg-glow saas-bg-glow-subtle" />
      <div className="matrix-grid" />

      {/* ── Fixed top navbar — matches dashboard reference (h-20, blur) ── */}
      <nav
        className="fixed top-0 inset-x-0 z-[500] h-20 border-b border-white/5 flex items-center"
        style={{
          background: "rgba(5,7,10,0.4)",
          backdropFilter: "blur(72px) saturate(180%)",
          WebkitBackdropFilter: "blur(72px) saturate(180%)",
        }}
      >
        <div style={{ maxWidth: "1600px" }} className="w-full mx-auto px-8 h-full flex items-center justify-between gap-6">
          {/* Left: the Vault's own mark + wordmark (its own product, links home) */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0 group cursor-pointer">
            <div
              className="w-11 h-11 flex items-center justify-center overflow-hidden p-1.5 group-hover:scale-105 transition-transform duration-300"
              style={{
                borderRadius: "1rem",
                background: "rgba(63,170,255,0.1)",
                boxShadow: "0 0 30px rgba(63,170,255,0.1), 0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              <img src="https://cdn.codeoce.com/logo/logo_white.png" alt="Castle Vault" className="w-full h-full object-contain" />
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-lg font-black uppercase tracking-tight text-white leading-none" style={{ fontFamily: "var(--font-outfit), sans-serif" }}>
                Castle<span style={{ color: "var(--void-accent)" }}>Vault</span>
              </span>
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-500 leading-none mt-1">Custom Twitch Emotes</span>
            </div>
          </Link>

          {/* Centre: the Vault's own section nav — Emotes / Studio */}
          <div
            className="hidden md:flex items-center gap-1 flex-shrink-0"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.05)",
              padding: "0.25rem",
              borderRadius: "1rem",
              backdropFilter: "blur(12px)",
            }}
          >
            <Link href="/" className={`section-nav-btn ${active === "emotes" ? "active" : ""}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              Emotes
            </Link>
            <Link href="/studio" className={`section-nav-btn ${active === "studio" ? "active" : ""}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0"><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" /></svg>
              Studio
            </Link>
          </div>

          {/* Global search — 7TV's signature nav element. Plain GET form: it
              navigates to /?q=, and the browse page seeds its live search from
              that, so it works with or without JS. */}
          <form action="/" method="get" className="hidden md:block flex-1 max-w-md">
            <div className="relative">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                name="q"
                placeholder="Search emotes…"
                aria-label="Search emotes"
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white outline-none focus:border-brand-primary/50 focus:bg-white/[0.07] transition-colors"
              />
            </div>
          </form>

          {/* Right: install-the-extension CTA + auth-aware corner */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <a
              href="https://app.creatorcastle.gg"
              className="saas-button-secondary !h-9 !px-4 !text-xs hidden lg:inline-flex"
            >
              Get the Extension
            </a>
            <VaultUserMenu />
          </div>
        </div>
      </nav>

      <div style={{ paddingTop: "5rem", minHeight: "100vh" }}>
        <main style={{ maxWidth: "1600px" }} className="mx-auto px-4 lg:px-8 py-8">{children}</main>

        <footer className="border-t border-white/5 mt-12">
          <div style={{ maxWidth: "1600px" }} className="mx-auto px-8 py-8 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-md bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center overflow-hidden">
                <img src="https://cdn.codeoce.com/logo/logo_white.png" alt="" className="w-full h-full object-contain p-1" />
              </span>
              <span className="text-sm font-bold text-zinc-500">Creator Castle</span>
            </div>
            <p className="text-xs text-zinc-600">
              Free custom Twitch emotes ·{" "}
              <a href="https://app.creatorcastle.gg" className="text-brand-primary hover:underline">Get the extension</a>
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}

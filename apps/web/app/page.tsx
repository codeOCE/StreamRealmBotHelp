import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-50 selection:bg-indigo-500/30 font-sans">
      <nav className="flex items-center justify-between p-8 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">SR</div>
          <span className="text-xl font-bold tracking-tight">Stream Realm</span>
        </div>
        <div className="flex gap-8 items-center text-sm font-medium text-zinc-400">
          <a href="#features" className="hover:text-zinc-50 transition-colors">Features</a>
          <a href="#pricing" className="hover:text-zinc-50 transition-colors">Pricing</a>
          <a href="/dashboard" className="px-5 py-2.5 bg-zinc-50 text-zinc-950 rounded-full hover:bg-zinc-200 transition-all font-semibold">Open Dashboard</a>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-8 text-center mt-20">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium mb-8 animate-fade-in font-sans">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
          Next-gen Twitch Bot Platform
        </div>

        <h1 className="text-6xl md:text-8xl font-black tracking-tighter max-w-4xl mb-8 leading-[0.9]">
          The ultimate toolkit for <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Streamers</span>.
        </h1>

        <p className="text-zinc-400 text-xl max-w-2xl mb-12 leading-relaxed">
          Level up your Twitch community with custom commands, XP systems, and professional-grade chat management. All in one unified dashboard.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <a href="/dashboard" className="h-14 px-10 flex items-center justify-center rounded-2xl bg-indigo-500 text-white font-bold text-lg hover:bg-indigo-600 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-indigo-500/20">
            Get Started Free
          </a>
          <button className="h-14 px-10 flex items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 transition-all font-bold text-zinc-300">
            View Live Demo
          </button>
        </div>

        <div className="mt-32 w-full max-w-5xl relative">
          <div className="absolute inset-0 bg-indigo-500/20 blur-[120px] rounded-full -z-10 h-64 w-64 left-1/2 -translate-x-1/2"></div>
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/10 p-4 backdrop-blur-xl shadow-2xl overflow-hidden">
            <div className="rounded-2xl border border-zinc-800 bg-black aspect-video overflow-hidden flex items-center justify-center relative bg-zinc-900/50">
              <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
              <span className="text-zinc-700 font-mono text-xl">Interactive Dashboard Preview</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="p-12 border-t border-zinc-900 mt-32 text-center text-zinc-600 text-sm">
        &copy; 2026 Stream Realm. Built for creators.
      </footer>
    </div>
  );
}

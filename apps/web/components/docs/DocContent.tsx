import type { LucideIcon } from 'lucide-react';

export function DocHeader({
  icon: Icon,
  kicker,
  title,
  description,
}: {
  icon: LucideIcon;
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <header className="space-y-3 pb-2 border-b border-white/[0.06]">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-primary/10 border border-brand-primary/20">
          <Icon className="size-5 text-brand-primary" strokeWidth={2.25} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600 mb-1">{kicker}</p>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight font-heading">{title}</h1>
        </div>
      </div>
      <p className="text-sm text-zinc-500 max-w-2xl leading-relaxed">{description}</p>
    </header>
  );
}

export function DocSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <div className="text-sm text-zinc-400 space-y-4 leading-relaxed max-w-3xl">{children}</div>
    </section>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-xs text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded px-1.5 py-0.5">
      {children}
    </code>
  );
}

export function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#030508] overflow-hidden">
      {label && (
        <div className="px-4 py-2 border-b border-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-zinc-600">
          {label}
        </div>
      )}
      <pre className="text-sm text-zinc-300 font-mono whitespace-pre-wrap break-words leading-relaxed px-4 py-3">
        {children}
      </pre>
    </div>
  );
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: React.ReactNode }) {
  const cls =
    tone === 'warn'
      ? 'border-amber-500/20 bg-amber-500/[0.06] text-amber-200/90'
      : 'border-brand-primary/20 bg-brand-primary/[0.06] text-zinc-300';
  return <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${cls}`}>{children}</div>;
}

export function DocTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/8">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/8 bg-white/[0.02]">
            {head.map((h) => (
              <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/[0.04] last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-zinc-300 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

'use client';

import { Braces, Copy, Check, FileText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  COMMAND_VARIABLE_DOCS,
  VARIABLE_CATEGORIES,
  type VariableDoc,
} from '@/lib/command-variables';
import { cn } from '@/lib/utils';

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-white transition-colors cursor-pointer',
        className,
      )}
      title="Copy"
    >
      {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#030508] overflow-hidden">
      {label && (
        <div className="px-4 py-2 border-b border-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-zinc-600">
          {label}
        </div>
      )}
      <div className="relative px-4 py-3">
        <pre className="text-sm text-zinc-300 font-mono whitespace-pre-wrap break-words leading-relaxed pr-16">
          {children}
        </pre>
        <CopyButton text={children} className="absolute top-3 right-3" />
      </div>
    </div>
  );
}

function VariableCard({ doc, onSelect }: { doc: VariableDoc; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(doc.id)}
      className={cn(
        'group text-left w-full rounded-xl border p-4 transition-[border-color,background-color,box-shadow] duration-200 cursor-pointer',
        doc.supported
          ? 'border-white/[0.08] bg-white/[0.02] hover:border-brand-primary/30 hover:bg-brand-primary/[0.04]'
          : 'border-white/[0.05] bg-white/[0.01] opacity-70 hover:opacity-90',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.06] text-zinc-500 group-hover:text-brand-primary group-hover:border-brand-primary/20 transition-colors">
          <FileText className="size-4" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-bold text-brand-primary group-hover:text-white transition-colors truncate">
            {doc.name}
          </p>
          <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed line-clamp-2">{doc.summary}</p>
        </div>
      </div>
    </button>
  );
}

function VariableDetail({ doc }: { doc: VariableDoc }) {
  return (
    <section id={doc.id} className="scroll-mt-24 space-y-5 pb-12 border-b border-white/[0.05] last:border-0">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600 mb-2">{doc.category}</p>
        <h2 className="font-mono text-xl font-bold text-white tracking-tight">{doc.name}</h2>
        <p className="text-sm text-zinc-400 mt-2 max-w-2xl leading-relaxed">{doc.summary}</p>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Overview</h3>
        <p className="text-sm text-zinc-300 leading-relaxed max-w-3xl">{doc.overview}</p>
      </div>

      {doc.usage && (
        <div className="rounded-xl border border-brand-primary/20 bg-brand-primary/[0.06] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-primary mb-1">Usage</p>
          <p className="text-sm text-zinc-300">{doc.usage}</p>
        </div>
      )}

      {doc.note && (
        <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
          <p className="text-sm text-zinc-400">{doc.note}</p>
        </div>
      )}

      {doc.parameters && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Parameters</h3>
          <p className="text-sm text-zinc-300 font-mono">{doc.parameters}</p>
        </div>
      )}

      {doc.aliases && doc.aliases.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Also written as</h3>
          <div className="flex flex-wrap gap-2">
            {doc.aliases.map((a) => (
              <code
                key={a}
                className="text-xs font-mono text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded-lg px-2.5 py-1"
              >
                {a}
              </code>
            ))}
          </div>
        </div>
      )}

      {doc.examples.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Examples</h3>
          {doc.examples.map((ex, i) => (
            <div key={i} className="space-y-2">
              {ex.label && <p className="text-xs font-semibold text-zinc-500">{ex.label}</p>}
              <CodeBlock label="Command response">{ex.input}</CodeBlock>
              <CodeBlock label="Output">{ex.output}</CodeBlock>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function VariablesReference() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMAND_VARIABLE_DOCS;
    return COMMAND_VARIABLE_DOCS.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.summary.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.aliases?.some((a) => a.toLowerCase().includes(q)),
    );
  }, [query]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const supportedDocs = COMMAND_VARIABLE_DOCS.filter((d) => d.supported);

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_200px] xl:gap-12">
      <div className="min-w-0 space-y-12">
        <header className="space-y-3 pb-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-primary/10 border border-brand-primary/20">
              <Braces className="size-5 text-brand-primary" strokeWidth={2.25} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600 mb-1">Chat commands</p>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight font-heading">Variables</h1>
            </div>
          </div>
          <p className="text-sm text-zinc-500 max-w-2xl leading-relaxed">
            Placeholders you can use in command responses. Replaced with live chat and channel data when a command runs.
          </p>
        </header>

        <section id="introduction" className="scroll-mt-24 space-y-5">
          <h2 className="text-lg font-bold text-white">Introduction</h2>
          <div className="text-sm text-zinc-400 space-y-4 max-w-3xl leading-relaxed">
            <p>
              Chat commands support <strong className="text-zinc-200 font-semibold">variables</strong> — placeholders
              that are replaced with real values when someone runs the command. They make responses dynamic without
              writing separate commands for every situation.
            </p>
            <p>
              For example, in the response{' '}
              <code className="text-zinc-200 bg-white/[0.04] border border-white/8 rounded px-1.5 py-0.5 font-mono text-xs">
                Hey $(touser), welcome to $(channel)!
              </code>
              , <code className="font-mono text-xs text-brand-primary">$(touser)</code> becomes the mentioned viewer
              and <code className="font-mono text-xs text-brand-primary">$(channel)</code> becomes your channel name.
            </p>
            <p>
              Creator Castle uses <code className="font-mono text-xs text-brand-primary">$(name)</code> syntax.
              Legacy <code className="font-mono text-xs text-brand-primary">${'{'}…{'}'}</code> tags from imports are
              converted automatically. Brace syntax <code className="font-mono text-xs text-brand-primary">{'{user}'}</code>{' '}
              still works for basic tags.
            </p>
          </div>
        </section>

        <section id="index" className="scroll-mt-24 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">All variables</h2>
              <p className="text-sm text-zinc-500 mt-1">
                {COMMAND_VARIABLE_DOCS.length} variables · click a card to jump to details
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-600 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search variables…"
                className="w-full bg-white/[0.03] border border-white/8 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-brand-primary/50 transition-colors"
              />
            </div>
          </div>

          {VARIABLE_CATEGORIES.map((category) => {
            const items = filtered.filter((d) => d.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category} className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600">{category}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map((doc) => (
                    <VariableCard key={doc.id} doc={doc} onSelect={scrollTo} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        <section className="space-y-2 pt-4">
          <h2 className="text-lg font-bold text-white mb-8">Reference</h2>
          {COMMAND_VARIABLE_DOCS.map((doc) => (
            <VariableDetail key={doc.id} doc={doc} />
          ))}
        </section>
      </div>

      <aside className="hidden xl:block">
        <nav className="sticky top-24 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600">On this page</p>
          <ul className="space-y-1 text-sm border-l border-white/[0.06]">
            <li>
              <a
                href="#introduction"
                className="block pl-3 py-1 text-zinc-500 hover:text-white border-l-2 border-transparent hover:border-brand-primary/50 -ml-px transition-colors"
              >
                Introduction
              </a>
            </li>
            <li>
              <a
                href="#index"
                className="block pl-3 py-1 text-zinc-500 hover:text-white border-l-2 border-transparent hover:border-brand-primary/50 -ml-px transition-colors"
              >
                All variables
              </a>
            </li>
            {supportedDocs.map((d) => (
              <li key={d.id}>
                <a
                  href={`#${d.id}`}
                  className="block pl-3 py-1 text-zinc-500 hover:text-white border-l-2 border-transparent hover:border-brand-primary/50 -ml-px transition-colors font-mono text-xs truncate"
                >
                  {d.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </div>
  );
}

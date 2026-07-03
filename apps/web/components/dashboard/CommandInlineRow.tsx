'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { VoidNumberInput } from './VoidNumberInput';
import { VoidSelect } from './VoidSelect';
import { VoidToggle } from './VoidToggle';
import { parseResponsesJson, splitResponseList } from '@/lib/split-responses';
import {
  COMMAND_CATEGORIES,
  normalizeCommandPayload,
  RESPONSE_MODES,
  RESPONSE_TYPES,
  USER_LEVELS,
  userLevelLabel,
  validateCommandForm,
  type CommandFormData,
} from '@/lib/command-form-options';
import { cn } from '@/lib/utils';

export type InlineCommand = CommandFormData & {
  id: string;
  usages?: number;
};

type SortKey = 'trigger' | 'cooldown' | 'userCooldown' | 'userLevel';

type CommandsTableProps = {
  commands: InlineCommand[];
  readOnly?: boolean;
  isLoading?: boolean;
  togglingId?: string | null;
  savingId?: string | null;
  expandedId: string | null;
  showNew: boolean;
  onExpand: (id: string | null) => void;
  onShowNew: (show: boolean) => void;
  onSave: (data: ReturnType<typeof normalizeCommandPayload>) => Promise<void> | void;
  onDelete?: (id: string) => void;
  onToggle?: (id: string, enabled: boolean) => void;
};

const inputClass =
  'w-full bg-white/[0.03] border border-white/8 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:border-brand-primary/50 transition-[border-color] duration-150';

function commandToForm(command?: InlineCommand, isNew?: boolean): CommandFormData {
  if (!command || isNew) {
    return {
      trigger: '',
      responses: [''],
      responseType: 'SAY',
      responseMode: 'ALL',
      aliases: [],
      userLevel: 'VIEWER',
      cooldown: 30,
      userCooldown: 10,
      enabled: true,
      description: '',
      category: 'General',
      isRegex: false,
      isBuiltIn: false,
    };
  }
  return {
    id: command.id,
    trigger: command.trigger,
    responses: command.responses?.length ? command.responses : [''],
    responseType: command.responseType ?? 'SAY',
    responseMode: command.responseMode === 'RANDOM' ? 'RANDOM' : 'ALL',
    aliases: command.aliases ?? [],
    userLevel: command.userLevel,
    cooldown: command.cooldown,
    userCooldown: command.userCooldown ?? 0,
    enabled: command.enabled,
    description: command.description ?? '',
    category: command.category ?? 'General',
    isRegex: command.isRegex ?? false,
    isBuiltIn: command.isBuiltIn,
  };
}

function responsePreview(command: InlineCommand): string {
  const first = command.responses?.find((r) => r.trim()) ?? command.description ?? '';
  if (!first) return command.isBuiltIn ? 'Built-in handler' : '—';
  return first;
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-semibold  hover:text-zinc-300 transition-colors cursor-pointer',
        active ? 'text-zinc-300' : 'text-zinc-500',
        className,
      )}
    >
      {label}
      {active ? (
        direction === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
      ) : (
        <ChevronDown className="size-3 opacity-30" />
      )}
    </button>
  );
}

function CommandEditorPanel({
  command,
  isNew,
  readOnly,
  saving,
  onSave,
  onCancel,
}: {
  command?: InlineCommand;
  isNew?: boolean;
  readOnly?: boolean;
  saving?: boolean;
  onSave: (data: ReturnType<typeof normalizeCommandPayload>) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(() => commandToForm(command, isNew));
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(!!isNew);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const baseline = useRef(JSON.stringify(commandToForm(command, isNew)));

  useEffect(() => {
    const next = commandToForm(command, isNew);
    setForm(next);
    baseline.current = JSON.stringify(next);
    setDirty(!!isNew);
    setError('');
  }, [command?.id, isNew]);

  const patch = (partial: Partial<CommandFormData>) => {
    setForm((prev) => {
      const next = { ...prev, ...partial };
      setDirty(JSON.stringify(next) !== baseline.current);
      return next;
    });
  };

  const nonEmptyResponseCount = form.responses.filter((r) => r.trim()).length;

  const updateResponse = (index: number, value: string) => {
    const next = [...form.responses];
    next[index] = value;
    patch({ responses: next });
  };

  const handleResponsePaste = (index: number, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const parts = splitResponseList(e.clipboardData.getData('text/plain'));
    if (parts.length <= 1) return;
    e.preventDefault();
    const next = [...form.responses];
    next.splice(index, 1, ...parts);
    patch({ responses: next.filter((r) => r.trim()).length > 0 ? next : [''] });
  };

  const mergeResponses = (items: string[]) => {
    const merged = [...form.responses.filter((r) => r.trim()), ...items.map((r) => r.trim()).filter(Boolean)];
    patch({ responses: merged.length > 0 ? merged : [''] });
  };

  const handleJsonUpload = async (file: File) => {
    try {
      mergeResponses(parseResponsesJson(await file.text()));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read JSON file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    const validationError = validateCommandForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    await onSave(normalizeCommandPayload({ ...form, id: command?.id }));
    if (!isNew) {
      baseline.current = JSON.stringify(form);
      setDirty(false);
    }
  };

  if (readOnly || form.isBuiltIn) {
    return (
      <div className="px-5 py-4 space-y-2">
        {form.responses.filter(Boolean).map((res, i) => (
          <p key={i} className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">
            {res || form.description || 'Built-in handler'}
          </p>
        ))}
        {form.description && form.responses.some(Boolean) && (
          <p className="text-xs text-zinc-600">{form.description}</p>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 py-4 space-y-4 border-t border-white/[0.04] bg-[#05070a]/50">
      {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold  text-zinc-600">Command</label>
          <div className="relative">
            {!form.isRegex && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-primary font-bold pointer-events-none">!</span>
            )}
            <input
              type="text"
              value={form.trigger}
              onChange={(e) => patch({ trigger: e.target.value })}
              className={cn(inputClass, !form.isRegex && 'pl-7 font-semibold')}
              placeholder={form.isRegex ? '^pattern$' : 'command'}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold  text-zinc-600">Aliases</label>
          <input
            type="text"
            disabled={form.isRegex}
            value={(form.aliases ?? []).join(', ')}
            onChange={(e) => patch({ aliases: e.target.value.split(',').map((s) => s.trim()) })}
            className={inputClass}
            placeholder="alias1, alias2"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold  text-zinc-600">Response</label>
        {form.responses.map((res, index) => (
          <div key={index} className="relative">
            <textarea
              value={res}
              onChange={(e) => updateResponse(index, e.target.value)}
              onPaste={(e) => handleResponsePaste(index, e)}
              rows={Math.min(5, Math.max(2, res.split('\n').length))}
              className={cn(inputClass, 'resize-y min-h-10 leading-relaxed', form.responses.length > 1 && 'pr-10')}
              placeholder={`Response ${index + 1}…`}
            />
            {form.responses.length > 1 && (
              <button
                type="button"
                onClick={() => patch({ responses: form.responses.filter((_, i) => i !== index) })}
                className="absolute top-2 right-2 p-1.5 rounded-md text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                aria-label="Remove response"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => patch({ responses: [...form.responses, ''] })}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-primary hover:text-white transition-colors cursor-pointer"
          >
            <Plus className="size-3.5" />
            Add response
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[11px] font-semibold text-zinc-500 hover:text-white transition-colors cursor-pointer"
          >
            Upload JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleJsonUpload(file);
            }}
          />
          {nonEmptyResponseCount > 1 && (
            <VoidSelect
              compact
              value={form.responseMode ?? 'ALL'}
              onChange={(e) => patch({ responseMode: e.target.value as 'ALL' | 'RANDOM' })}
              className="!w-auto min-w-[110px]"
            >
              {RESPONSE_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </VoidSelect>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold  text-zinc-600">Global CD</label>
          <VoidNumberInput value={form.cooldown} onChange={(v) => patch({ cooldown: v })} min={0} suffix="sec" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold  text-zinc-600">User CD</label>
          <VoidNumberInput value={form.userCooldown ?? 0} onChange={(v) => patch({ userCooldown: v })} min={0} suffix="sec" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold  text-zinc-600">Access</label>
          <VoidSelect value={form.userLevel} onChange={(e) => patch({ userLevel: e.target.value })}>
            {USER_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </VoidSelect>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold  text-zinc-600">Response type</label>
          <VoidSelect
            value={form.responseType}
            onChange={(e) => patch({ responseType: e.target.value as CommandFormData['responseType'] })}
          >
            {RESPONSE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </VoidSelect>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[160px] space-y-1">
          <label className="text-[10px] font-bold  text-zinc-600">Description</label>
          <input
            type="text"
            value={form.description ?? ''}
            onChange={(e) => patch({ description: e.target.value })}
            className={inputClass}
            placeholder="Optional note…"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold  text-zinc-600">Category</label>
          <VoidSelect value={form.category ?? 'General'} onChange={(e) => patch({ category: e.target.value })} className="min-w-[130px]">
            {COMMAND_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </VoidSelect>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none pb-2.5">
          <input
            type="checkbox"
            checked={form.isRegex ?? false}
            onChange={(e) => patch({ isRegex: e.target.checked })}
            className="size-3.5 rounded bg-white/5 border border-white/10 checked:bg-brand-primary appearance-none cursor-pointer"
          />
          <span className="text-xs text-zinc-400">Regex</span>
        </label>
      </div>

      {(dirty || isNew) && (
        <div className="flex justify-end gap-2 pt-1">
          {isNew && onCancel && (
            <button type="button" onClick={onCancel} className="saas-button-secondary !py-2 !px-4 text-xs">
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="saas-button !py-2 !px-4 text-xs"
          >
            {saving ? 'Saving…' : isNew ? 'Create command' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  );
}

export function CommandsTable({
  commands,
  readOnly,
  isLoading,
  togglingId,
  savingId,
  expandedId,
  showNew,
  onExpand,
  onShowNew,
  onSave,
  onDelete,
  onToggle,
}: CommandsTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('trigger');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = commands;
    if (q) {
      list = list.filter(
        (c) =>
          c.trigger.toLowerCase().includes(q) ||
          responsePreview(c).toLowerCase().includes(q) ||
          userLevelLabel(c.userLevel).toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'trigger') cmp = a.trigger.localeCompare(b.trigger);
      else if (sortKey === 'cooldown') cmp = a.cooldown - b.cooldown;
      else if (sortKey === 'userCooldown') cmp = (a.userCooldown ?? 0) - (b.userCooldown ?? 0);
      else if (sortKey === 'userLevel') cmp = userLevelLabel(a.userLevel).localeCompare(userLevelLabel(b.userLevel));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [commands, search, sortKey, sortDir]);

  return (
    <div className="space-y-4">
      {/* Inline editor toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-600 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="w-full h-10 bg-white/[0.03] border border-white/8 rounded-lg pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-brand-primary/40 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Link
            href="/docs/variables"
            target="_blank"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-white/10 text-[11px] font-bold  text-zinc-400 hover:text-white hover:border-white/20 transition-colors"
          >
            Variables
            <ExternalLink className="size-3.5 opacity-60" />
          </Link>
          {!readOnly && (
            <button
              type="button"
              onClick={() => {
                onShowNew(true);
                onExpand('new');
              }}
              disabled={showNew}
              className="h-10 px-5 rounded-lg bg-brand-primary text-[#05070a] text-[11px] font-bold  hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer"
            >
              Add new command
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
              <th className="w-14 px-3 py-3" />
              <th className="px-3 py-3">
                <SortHeader label="Command" sortKey="trigger" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
              </th>
              <th className="px-3 py-3 text-[10px] font-semibold  text-zinc-500">Response</th>
              <th className="px-3 py-3 text-center w-24">
                <SortHeader
                  label="Global CD"
                  sortKey="cooldown"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={handleSort}
                  className="justify-center w-full"
                />
              </th>
              <th className="px-3 py-3 text-center w-24">
                <SortHeader
                  label="User CD"
                  sortKey="userCooldown"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={handleSort}
                  className="justify-center w-full"
                />
              </th>
              <th className="px-3 py-3 w-36">
                <SortHeader label="Access" sortKey="userLevel" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
              </th>
              <th className="w-20 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              [0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-b border-white/[0.04]">
                  <td colSpan={7} className="px-4 py-3">
                    <div className="skeleton h-4 w-full rounded" />
                  </td>
                </tr>
              ))}

            {!isLoading && showNew && !readOnly && (
              <>
                <tr className="bg-brand-primary/[0.06] border-b border-brand-primary/20">
                  <td colSpan={7} className="px-4 py-2.5 text-xs font-semibold text-brand-primary">
                    New command
                  </td>
                </tr>
                <tr>
                  <td colSpan={7} className="p-0 border-b border-white/[0.06]">
                    <CommandEditorPanel
                      isNew
                      saving={savingId === 'new'}
                      onSave={onSave}
                      onCancel={() => {
                        onShowNew(false);
                        onExpand(null);
                      }}
                    />
                  </td>
                </tr>
              </>
            )}

            {!isLoading &&
              filtered.map((command) => {
                const isExpanded = expandedId === command.id;
                const preview = responsePreview(command);
                return (
                  <React.Fragment key={command.id}>
                    <tr
                      className={cn(
                        'border-b border-white/[0.04] transition-colors group/row',
                        isExpanded ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]',
                      )}
                    >
                      <td className="px-3 py-2.5 align-middle">
                        {onToggle && (
                          <VoidToggle
                            checked={command.enabled}
                            disabled={togglingId === command.id}
                            onChange={(enabled) => onToggle(command.id, enabled)}
                            aria-label={`Toggle !${command.trigger}`}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <span className="text-sm font-semibold text-white whitespace-nowrap">!{command.trigger}</span>
                      </td>
                      <td className="px-3 py-2.5 align-middle max-w-md">
                        <p className="text-sm text-zinc-500 truncate" title={preview}>
                          {preview}
                          {command.responses && command.responses.filter((r) => r.trim()).length > 1 && (
                            <span className="text-brand-primary/80 ml-1 text-[10px]">
                              +{command.responses.filter((r) => r.trim()).length - 1}
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 align-middle text-center text-sm text-zinc-400 tabular-nums">
                        {command.cooldown}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-center text-sm text-zinc-400 tabular-nums">
                        {command.userCooldown ?? 0}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-sm text-zinc-400 whitespace-nowrap">
                        {userLevelLabel(command.userLevel)}
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex items-center justify-end gap-0.5">
                          {!readOnly && !command.isBuiltIn && onDelete && (
                            <button
                              type="button"
                              onClick={() => onDelete(command.id)}
                              className="p-2 rounded-md text-zinc-600 hover:text-brand-accent hover:bg-brand-accent/10 transition-colors cursor-pointer opacity-0 group-hover/row:opacity-100"
                              aria-label="Delete command"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onExpand(isExpanded ? null : command.id)}
                            className="p-2 rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            <ChevronDown className={cn('size-4 transition-transform duration-200', isExpanded && 'rotate-180')} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-white/[0.06]">
                        <td colSpan={7} className="p-0">
                          <CommandEditorPanel
                            command={command}
                            readOnly={readOnly || command.isBuiltIn}
                            saving={savingId === command.id}
                            onSave={onSave}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

            {!isLoading && filtered.length === 0 && !showNew && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-sm text-zinc-500">
                  {search ? 'No commands match your search.' : 'No commands yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

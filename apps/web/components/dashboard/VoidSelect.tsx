"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type VoidSelectOption = { value: string; label: string };

function parseOptions(children: React.ReactNode): VoidSelectOption[] {
  return React.Children.toArray(children)
    .filter(
      (child): child is React.ReactElement<{ value?: string | number; children?: React.ReactNode }> =>
        React.isValidElement(child) && child.type === "option",
    )
    .map((child) => {
      const value = String(child.props.value ?? "");
      const label = String(child.props.children ?? "").trim() || value;
      return { value, label };
    });
}

/** Matches CommandModal text inputs / void-input surface. */
const triggerClasses =
  "flex w-full items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white transition-[border-color,background-color] duration-150 hover:border-white/12 hover:bg-white/[0.05] focus:outline-none focus:border-brand-primary/50 focus:bg-white/[0.05] data-[state=open]:border-brand-primary/50 data-[state=open]:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-45 h-auto min-h-0 shadow-none ring-0 focus:ring-0 focus:ring-offset-0 [&>span]:truncate";

const contentClasses =
  "z-[1100] overflow-hidden rounded-xl border border-white/8 bg-[#0a0c10] text-white shadow-[0_16px_48px_rgba(0,0,0,0.45)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95";

const itemClasses =
  "relative flex w-full cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm text-zinc-300 outline-none focus:bg-white/[0.06] focus:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[state=checked]:bg-brand-primary/10 data-[state=checked]:text-brand-primary";

type VoidSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> & {
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  compact?: boolean;
};

/** Void-themed select — Radix dropdown so menu + trigger match dashboard inputs. */
export function VoidSelect({
  value = "",
  onChange,
  compact,
  className,
  disabled,
  children,
  id,
}: VoidSelectProps) {
  const options = React.useMemo(() => parseOptions(children), [children]);

  // An <option value=""> is a placeholder, not a real choice — Radix forbids
  // empty Item values and uses "" to mean "cleared, show placeholder". Pull its
  // label out as the placeholder and only render the real (non-empty) options.
  const placeholder = options.find((o) => o.value === "")?.label || "Select…";
  const items = options.filter((o) => o.value !== "");

  const handleValueChange = (next: string) => {
    onChange?.({ target: { value: next } } as React.ChangeEvent<HTMLSelectElement>);
  };

  if (items.length === 0) return null;

  return (
    <SelectPrimitive.Root value={value} onValueChange={handleValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          "void-select-trigger",
          triggerClasses,
          compact && "py-2 px-3 text-[11px] font-bold",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-zinc-600" strokeWidth={2.5} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={contentClasses}
          position="popper"
          sideOffset={6}
        >
          <SelectPrimitive.Viewport className="p-1 min-w-[var(--radix-select-trigger-width)]">
            {items.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className={itemClasses}
              >
                <span className="absolute left-2.5 flex size-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <span className="size-1.5 rounded-full bg-brand-primary" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

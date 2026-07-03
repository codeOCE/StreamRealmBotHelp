"use client";

import { cn } from "@/lib/utils";

type VoidToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

/** Void-themed toggle switch — uses .saas-toggle for consistent knob centering. */
export function VoidToggle({
  checked,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: VoidToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? (checked ? "On" : "Off")}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className={cn("saas-toggle", checked && "on", className)}
    />
  );
}

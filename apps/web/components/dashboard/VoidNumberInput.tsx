"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

type VoidNumberInputProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
};

function clamp(n: number, min: number, max?: number) {
  let v = n;
  if (v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return v;
}

export function VoidNumberInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  suffix,
  className,
  disabled,
  id,
}: VoidNumberInputProps) {
  const bump = (delta: number) => {
    if (disabled) return;
    onChange(clamp(value + delta, min, max));
  };

  return (
    <div className={cn("void-number-field", disabled && "void-number-field--disabled", className)}>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(min);
            return;
          }
          onChange(clamp(parseInt(raw, 10) || 0, min, max));
        }}
        className="void-number-field__input void-number-input tabular-nums"
      />
      <div className="void-number-field__aside">
        <div className="void-number-field__steps">
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled || (max !== undefined && value >= max)}
            onClick={() => bump(step)}
            className="void-number-field__step"
            aria-label="Increase"
          >
            <ChevronUp className="w-3 h-3" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled || value <= min}
            onClick={() => bump(-step)}
            className="void-number-field__step"
            aria-label="Decrease"
          >
            <ChevronDown className="w-3 h-3" strokeWidth={2.5} />
          </button>
        </div>
        {suffix ? <span className="void-number-field__suffix">{suffix}</span> : null}
      </div>
    </div>
  );
}

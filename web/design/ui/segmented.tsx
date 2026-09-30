"use client";

import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";
import { spring } from "@/motion/tokens";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string = string> = {
  value: T;
  label: ReactNode;
  /** Short line under the control, aligned with the option (e.g. "What Aave uses"). */
  description?: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
};

type SegmentedProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Names the radio group. */
  "aria-label": string;
  size?: "sm" | "md";
  disabled?: boolean;
  id?: string;
  className?: string;
};

/**
 * One-of-N switch (radio group semantics). Selection cannot be cleared; arrow keys move focus and
 * selection together, like native radios. The active background slides between options.
 */
export function Segmented<T extends string>({
  options,
  value,
  onValueChange,
  "aria-label": ariaLabel,
  size = "md",
  disabled,
  id,
  className,
}: SegmentedProps<T>) {
  const uid = useId();
  const reduceMotion = useReducedMotion();
  const columns = { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` };
  const hasDescriptions = options.some((option) => option.description);

  // Radix sends "" when the active item is pressed again: a segmented control never clears.
  const select = (next: string) => {
    if (next && next !== value) onValueChange(next as T);
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <ToggleGroup.Root
        type="single"
        id={id}
        value={value}
        onValueChange={select}
        disabled={disabled}
        aria-label={ariaLabel}
        className="grid rounded-control border border-line-2 bg-bg p-[3px]"
        style={columns}
      >
        {options.map((option, i) => {
          const active = option.value === value;
          const Icon = option.icon;
          return (
            <ToggleGroup.Item
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              aria-describedby={option.description ? `${uid}-d${i}` : undefined}
              // Selection follows focus (arrow keys), as in a native radio group.
              onFocus={() => select(option.value)}
              className={cn(
                "group/segment relative isolate flex min-w-0 items-center justify-center gap-2 rounded-tag px-3 text-center font-medium",
                "text-fg-3 transition-colors duration-(--dur-fast) ease-out-quart hover:text-fg-1 data-[state=on]:text-fg-1",
                "focus-visible:-outline-offset-2 disabled:pointer-events-none disabled:opacity-45",
                size === "sm" ? "min-h-7 px-2.5 py-1 text-caption" : "min-h-9 py-1.5 text-body-sm",
              )}
            >
              {active && (
                <motion.span
                  layoutId={`${uid}-active`}
                  transition={reduceMotion ? { duration: 0 } : spring.soft}
                  className="absolute inset-0 -z-10 rounded-tag border border-line-3 bg-elev-3 shadow-panel"
                />
              )}
              <span className="flex min-w-0 items-center gap-2 transition-[scale] duration-(--dur-fast) ease-out-quart group-active/segment:scale-[0.97] motion-reduce:group-active/segment:scale-100">
                {Icon && <Icon aria-hidden className={cn("shrink-0", size === "sm" ? "size-3.5" : "size-4")} />}
                <span className="min-w-0 text-balance">{option.label}</span>
              </span>
            </ToggleGroup.Item>
          );
        })}
      </ToggleGroup.Root>

      {hasDescriptions && (
        <div className="grid gap-x-[3px] px-[3px]" style={columns}>
          {options.map((option, i) => (
            <p
              key={option.value}
              id={`${uid}-d${i}`}
              className={cn(
                "px-2 text-center text-caption text-balance transition-colors duration-(--dur-fast) ease-out-quart",
                option.value === value ? "text-fg-2" : "text-fg-3",
              )}
            >
              {option.description}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

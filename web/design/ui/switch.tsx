"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type SwitchProps = Omit<ComponentProps<"button">, "children" | "value" | "onChange"> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Visible label, part of the hit area. Without it, pass `aria-label`. */
  label?: ReactNode;
  size?: "sm" | "md";
};

const sizes = {
  // track: border 1px + padding 2px around the thumb; travel = inner width - thumb.
  md: { track: "h-5 w-9", thumb: "size-3.5 group-aria-checked/switch:translate-x-4", button: "min-h-8 gap-3 text-body-sm" },
  sm: { track: "h-4 w-7", thumb: "size-2.5 group-aria-checked/switch:translate-x-3", button: "min-h-6 gap-2 text-caption" },
} as const;

/** On/off control (`role="switch"`). Controlled (`checked`) or uncontrolled (`defaultChecked`); Space and Enter toggle. */
export function Switch({
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  label,
  size = "md",
  className,
  onClick,
  ...props
}: SwitchProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultChecked);
  const checked = checkedProp ?? uncontrolled;
  const s = sizes[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "on" : "off"}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (checkedProp === undefined) setUncontrolled(!checked);
        onCheckedChange?.(!checked);
      }}
      className={cn(
        "group/switch inline-flex shrink-0 select-none items-center rounded-control text-fg-1",
        "disabled:pointer-events-none disabled:opacity-45",
        s.button,
        className,
      )}
      {...props}
    >
      {label !== undefined && <span>{label}</span>}
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center rounded-tag border p-0.5",
          "transition-[background-color,border-color,box-shadow] duration-(--dur-fast) ease-out-quart",
          "border-line-strong bg-elev-2 group-hover/switch:border-fg-3",
          "group-aria-checked/switch:border-fg-1 group-aria-checked/switch:bg-fg-1 group-aria-checked/switch:group-hover/switch:shadow-[0_0_0_3px_var(--color-line-2)]",
          s.track,
        )}
      >
        <span
          className={cn(
            "block rounded-[2px] bg-fg-3 transition-[translate,scale,background-color] duration-(--dur-fast) ease-out-quart",
            "group-hover/switch:bg-fg-2 group-aria-checked/switch:bg-bg group-active/switch:scale-[0.82] motion-reduce:transition-none",
            s.thumb,
          )}
        />
      </span>
    </button>
  );
}

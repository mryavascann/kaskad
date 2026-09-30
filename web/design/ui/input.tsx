"use client";

import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";

const shellStyles = cva(
  [
    "relative flex w-full min-w-0 cursor-text items-center rounded-control border bg-bg text-fg-1",
    "transition-[border-color,background-color] duration-(--dur-fast) ease-out-quart",
    // The ring sits on the shell, so leading icons and trailing actions are inside it.
    "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-monad-hi",
    "has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-45",
  ],
  {
    variants: {
      size: {
        sm: "h-8 gap-2 pl-2.5",
        md: "h-11 gap-2.5 pl-3",
        lg: "h-13 gap-3 pl-4",
      },
      invalid: {
        true: "border-liq bg-liq/5 hover:border-liq-hi",
        false: "border-line-strong hover:border-fg-3 has-[input:focus-visible]:border-fg-3",
      },
    },
    defaultVariants: { size: "md", invalid: false },
  },
);

const textSize = {
  // 16px on touch screens: iOS zooms into anything smaller.
  sm: "text-caption pointer-coarse:text-body",
  md: "text-body-sm pointer-coarse:text-body",
  lg: "text-body",
} as const;

const endPadding = { sm: "pr-2.5", md: "pr-3", lg: "pr-4" } as const;

type InputProps = Omit<ComponentProps<"input">, "size"> & {
  size?: "sm" | "md" | "lg";
  /** Mono, tabular text: addresses, hashes, amounts. */
  mono?: boolean;
  /** Decorative leading mark, e.g. a lucide icon (hidden from assistive tech). */
  leading?: ReactNode;
  /** Trailing actions, e.g. `<InputAction>Paste</InputAction>`. */
  trailing?: ReactNode;
  /** Error state: liq border and `aria-invalid`. Set automatically inside a `<Field error>`. */
  invalid?: boolean;
  /** Classes for the outer shell (width, margins). `className` styles the <input> itself. */
  shellClassName?: string;
};

/** Text input in a shell with optional leading icon and trailing actions. Reads id / aria wiring from `<Field>`. */
export function Input({
  size = "md",
  mono = false,
  leading,
  trailing,
  invalid,
  shellClassName,
  className,
  id,
  required,
  disabled,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: InputProps) {
  const field = useFieldControl();
  const isInvalid = Boolean(invalid || ariaInvalid === true || ariaInvalid === "true" || field?.["aria-invalid"]);
  const describedByAll = [field?.["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined;

  return (
    <div
      className={cn(shellStyles({ size, invalid: isInvalid }), !trailing && endPadding[size], shellClassName)}
      // Clicking the padding or the leading icon focuses the input (a click on a trailing action does not).
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, a, input")) return;
        event.preventDefault();
        event.currentTarget.querySelector("input")?.focus();
      }}
    >
      {leading && (
        <span aria-hidden className="flex shrink-0 text-fg-3 [&_svg]:size-4">
          {leading}
        </span>
      )}
      <input
        id={id ?? field?.id}
        required={required ?? field?.required}
        disabled={disabled ?? field?.disabled}
        aria-describedby={describedByAll}
        aria-invalid={isInvalid || undefined}
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent text-fg-1 outline-none placeholder:text-fg-3 disabled:cursor-not-allowed",
          "[&::-webkit-search-cancel-button]:hidden",
          mono && "font-mono",
          textSize[size],
          className,
        )}
        {...props}
      />
      {trailing && <span className="flex shrink-0 items-center gap-1 pr-1.5">{trailing}</span>}
    </div>
  );
}

/** Small button that lives inside an Input's trailing slot (Paste, Clear, Max). Icon-only needs `aria-label`. */
export function InputAction({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 min-w-7 shrink-0 items-center justify-center gap-1.5 rounded-tag px-2 text-caption font-medium text-fg-2",
        "transition-[background-color,color,scale] duration-(--dur-fast) ease-out-quart hover:bg-elev-3 hover:text-fg-1",
        "active:scale-95 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

/** For wallet-address inputs: no spell check, autocorrect, capitalisation or autofill. */
export const addressInputProps = {
  spellCheck: false,
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  inputMode: "text",
} as const satisfies ComponentProps<"input">;

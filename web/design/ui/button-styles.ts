import { cva, type VariantProps } from "class-variance-authority";

/**
 * Button classes, in a module without "use client" so Server Components can call it (a function
 * exported from a client module is only a reference on the server). Used by Button and ButtonLink.
 */
export const buttonStyles = cva(
  [
    "group/button relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap",
    "rounded-control border font-medium tracking-[-0.005em]",
    "transition-[background-color,border-color,color,box-shadow,scale] duration-(--dur-fast) ease-out-quart",
    "active:scale-[0.98] motion-reduce:active:scale-100",
    "disabled:pointer-events-none disabled:opacity-45 aria-busy:pointer-events-none",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        /** One per view: the action the screen exists for. */
        primary: "border-fg-1 bg-fg-1 text-bg hover:shadow-[0_0_0_4px_var(--color-line-2)]",
        secondary: "border-line-3 bg-transparent text-fg-1 hover:border-line-strong hover:bg-elev-1",
        ghost: "border-transparent bg-transparent text-fg-2 hover:bg-elev-2 hover:text-fg-1",
        /** Actions whose point is to fail or alarm (e.g. "Try to borrow" on a paused market). */
        alarm: "border-liq/50 bg-liq/8 text-liq-hi hover:border-liq hover:bg-liq/14",
      },
      size: {
        sm: "h-8 px-3 text-body-sm",
        md: "h-11 px-5 text-body-sm",
        lg: "h-13 px-6 text-body",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonVariants = VariantProps<typeof buttonStyles>;

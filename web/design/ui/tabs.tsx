"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion, useReducedMotion } from "motion/react";
import { createContext, use, useId, useState, type ComponentProps, type ReactNode } from "react";
import { spring } from "@/motion/tokens";
import { cn } from "@/lib/utils";
import styles from "./tabs.module.css";

/** The selected value is mirrored here so the active trigger can render the sliding underline. */
const TabsContext = createContext<{ value?: string; indicatorId: string }>({ indicatorId: "tabs" });

/** Controlled (`value` + `onValueChange`) or uncontrolled (`defaultValue`). Keyboard per Radix: arrows, Home/End. */
export function Tabs({ value: valueProp, defaultValue, onValueChange, className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const value = valueProp ?? uncontrolled;
  const indicatorId = useId();
  const change = (next: string) => {
    if (valueProp === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };
  return (
    <TabsContext value={{ value, indicatorId }}>
      <TabsPrimitive.Root value={value} onValueChange={change} className={cn("flex min-w-0 flex-col", className)} {...props} />
    </TabsContext>
  );
}

/**
 * Scrolls sideways on narrow screens: scrollbar hidden (nothing jumps when it would appear), and the
 * edge with more tabs fades out.
 */
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        styles.list,
        "flex min-w-0 overflow-x-auto overscroll-x-contain shadow-[inset_0_-1px_0_var(--color-line-2)]",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

type TabsTriggerProps = ComponentProps<typeof TabsPrimitive.Trigger> & {
  /** Small mono badge after the label (e.g. the number of books). Pass real data only. */
  count?: ReactNode;
};

export function TabsTrigger({ value, count, className, children, ...props }: TabsTriggerProps) {
  const { value: selected, indicatorId } = use(TabsContext);
  const reduceMotion = useReducedMotion();
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        "group/tab relative inline-flex h-11 shrink-0 select-none items-center whitespace-nowrap px-3 text-body-sm font-medium",
        "text-fg-3 transition-colors duration-(--dur-fast) ease-out-quart hover:text-fg-1 data-[state=active]:text-fg-1",
        // The list clips overflow, so the focus ring sits inside the trigger, clear of the 2px underline.
        "rounded-control focus-visible:-outline-offset-4 disabled:pointer-events-none disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <span className="inline-flex items-center gap-2 transition-[translate] duration-(--dur-fast) ease-out-quart group-active/tab:translate-y-px motion-reduce:group-active/tab:translate-y-0">
        {children}
        {/* The space keeps the accessible name readable ("Monad 5", not "Monad5"); flex hides it visually. */}
        {count !== undefined && " "}
        {count !== undefined && (
          <span className="rounded-tag border border-line-2 px-1.5 py-0.5 font-mono text-label leading-none tracking-normal text-fg-3 transition-colors duration-(--dur-fast) group-hover/tab:text-fg-2 group-data-[state=active]/tab:border-line-3 group-data-[state=active]/tab:text-fg-1">
            {count}
          </span>
        )}
      </span>
      {selected === value && (
        <motion.span
          aria-hidden
          layoutId={`${indicatorId}-underline`}
          transition={reduceMotion ? { duration: 0 } : spring.soft}
          className="absolute inset-x-3 bottom-0 h-0.5 bg-fg-1"
        />
      )}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("mt-5 min-w-0 rounded-tag focus-visible:outline-offset-4 data-[state=active]:animate-fade-in", className)}
      {...props}
    />
  );
}

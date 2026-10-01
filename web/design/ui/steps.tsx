import { Check, LoaderCircle, OctagonAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StepStatus = "pending" | "active" | "done" | "error";

export type Step = {
  id: string;
  label: ReactNode;
  status: StepStatus;
  /** Second line: what is happening, the receipt, or (for `error`) why it failed. */
  detail?: ReactNode;
};

/** Spoken after each label, since the marker alone is visual. English defaults; pass your own copy. */
export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  pending: "Not started",
  active: "In progress",
  done: "Done",
  error: "Failed",
};

const marker: Record<StepStatus, string> = {
  pending: "border-line-3 text-fg-3",
  active: "border-fg-2 bg-elev-2 text-fg-1",
  done: "border-safe/45 bg-safe/10 text-safe",
  error: "border-liq/60 bg-liq/12 text-liq-hi",
};

const labelColor: Record<StepStatus, string> = {
  pending: "text-fg-3",
  active: "text-fg-1 font-medium",
  done: "text-fg-2",
  error: "text-fg-1 font-medium",
};

type StepsProps = Omit<ComponentProps<"ol">, "children"> & {
  steps: Step[];
  statusLabels?: Partial<Record<StepStatus, string>>;
};

/** Transaction progress: numbered markers on a hairline, the active step marked with `aria-current="step"`. */
export function Steps({ steps, statusLabels, className, ...props }: StepsProps) {
  const spoken = { ...STEP_STATUS_LABELS, ...statusLabels };
  return (
    <ol data-slot="steps" className={cn("flex min-w-0 flex-col", className)} {...props}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li
            key={step.id}
            data-status={step.status}
            aria-current={step.status === "active" ? "step" : undefined}
            className={cn("relative flex min-w-0 gap-3.5", !last && "pb-6")}
          >
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-6.5 bottom-1 left-2.75 w-px",
                  step.status === "done" ? "bg-safe/40" : step.status === "error" ? "bg-liq/40" : "bg-line-2",
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative grid size-5.5 shrink-0 place-items-center rounded-tag border font-mono text-label tracking-normal",
                marker[step.status],
              )}
            >
              {step.status === "pending" && String(i + 1).padStart(2, "0")}
              {step.status === "active" && <LoaderCircle className="size-3.5 motion-safe:animate-spin" />}
              {step.status === "done" && <Check className="size-3.5" />}
              {step.status === "error" && <OctagonAlert className="size-3.5" />}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className={cn("text-body-sm leading-5.5", labelColor[step.status])}>
                {step.label}
                {/* Comma, not a leading space: whitespace at the start of an sr-only box is collapsed. */}
                <span className="sr-only">, {spoken[step.status]}</span>
              </p>
              {step.detail && (
                <div className={cn("text-caption", step.status === "error" ? "text-liq-hi" : "text-fg-3")}>{step.detail}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

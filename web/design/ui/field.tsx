"use client";

import { OctagonAlert } from "lucide-react";
import { createContext, use, useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  required?: boolean;
  disabled?: boolean;
};

const FieldContext = createContext<FieldControlProps | null>(null);

/** Inside a `<Field>`: the id and aria wiring its control should use. `null` outside a Field. */
export function useFieldControl() {
  return use(FieldContext);
}

type FieldProps = {
  label: ReactNode;
  /** Format help under the control, linked with `aria-describedby`. */
  hint?: ReactNode;
  /** Validation message. Sets `aria-invalid` on the control and is announced politely when it appears. */
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Visible word next to the label of a required field. */
  requiredLabel?: string;
  /** Id for the control (generated when omitted). */
  id?: string;
  className?: string;
  /** One control that reads `useFieldControl()` (e.g. `<Input />`). */
  children: ReactNode;
};

/** Label, hint and error around one control, with `id` / `aria-describedby` / `aria-invalid` wired up. */
export function Field({ label, hint, error, required, disabled, requiredLabel = "Required", id, className, children }: FieldProps) {
  const auto = useId();
  const controlId = id ?? `${auto}-control`;
  const hintId = hint ? `${auto}-hint` : undefined;
  const errorId = error ? `${auto}-error` : undefined;
  const control: FieldControlProps = {
    id: controlId,
    "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
    "aria-invalid": error ? true : undefined,
    required,
    disabled,
  };

  return (
    <div className={cn("flex min-w-0 flex-col", disabled && "cursor-not-allowed", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={controlId} className={cn("text-body-sm font-medium text-fg-1", disabled && "text-fg-3")}>
          {label}
        </label>
        {required && <span className="label-mono text-fg-3">{requiredLabel}</span>}
      </div>
      <FieldContext value={control}>{children}</FieldContext>
      {hint && (
        <p id={hintId} className="mt-2 text-caption text-fg-3">
          {hint}
        </p>
      )}
      {/* Always rendered (empty = zero height) so screen readers announce an error when it appears. */}
      <div aria-live="polite">
        {error && (
          <p id={errorId} className="mt-2 flex items-start gap-1.5 text-caption text-liq-hi">
            <OctagonAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </div>
  );
}

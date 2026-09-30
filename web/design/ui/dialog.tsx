"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import styles from "./overlay.module.css";
import { toneIcon, toneSoft, toneText, type Tone } from "./tone";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  /** Corner close button (Escape and a click on the backdrop close the dialog either way). */
  showClose?: boolean;
  /** Accessible name of the corner close button. */
  closeLabel?: string;
};

/**
 * Modal panel over a dimmed, blurred backdrop: a bottom sheet on phones, centered from 40rem.
 * Focus is trapped inside and returns to the trigger on close.
 */
export function DialogContent({
  className,
  children,
  showClose = true,
  closeLabel = "Close",
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: DialogContentProps) {
  // Radix returns focus to its <DialogTrigger>. A dialog opened from state (e.g. after a check) has none,
  // so remember what had focus when it opened and go back there.
  const opener = useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={cn(styles.overlay, "fixed inset-0 z-(--z-dialog) bg-void/70 backdrop-blur-sm")} />
      <DialogPrimitive.Content
        onOpenAutoFocus={(event) => {
          const active = document.activeElement;
          opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented || !opener.current?.isConnected) return;
          event.preventDefault();
          opener.current.focus();
        }}
        className={cn(
          styles.sheet,
          "fixed z-(--z-dialog) flex flex-col gap-5 overflow-y-auto overscroll-contain border border-line-3 bg-elev-1 p-5 shadow-pop outline-none",
          // Phones: bottom sheet above the home indicator.
          "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-sheet border-b-0 pb-[calc(1.25rem+env(safe-area-inset-bottom))]",
          // From 40rem: centered card.
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(85dvh,44rem)] sm:w-[min(32rem,calc(100vw-3rem))]",
          "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-sheet sm:border-b sm:p-6",
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className={cn(
              "absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-control text-fg-3",
              "transition-[background-color,color,scale] duration-(--dur-fast) ease-out-quart hover:bg-elev-3 hover:text-fg-1",
              "active:scale-95 motion-reduce:active:scale-100 sm:right-4 sm:top-4 [&_svg]:size-4",
            )}
          >
            <X aria-hidden />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Title + description stack; leaves room for the corner close button. */
export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 pr-10", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-title-3 text-fg-1", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-body-sm text-fg-2", className)} {...props} />;
}

/** Actions row on a hairline, full width to the panel edges. Buttons stack (primary on top) on phones. */
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "-mx-5 mt-1 -mb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col-reverse gap-2 border-t border-line px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]",
        "sm:-mx-6 sm:-mb-6 sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:pb-4",
        className,
      )}
      {...props}
    />
  );
}

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** What happens and what it costs. Pass real values only (e.g. the quoted gas cost). */
  description?: ReactNode;
  /** Extra detail between the description and the actions. */
  children?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** `liq` turns the confirm button into an alarm button; any tone other than neutral adds its icon. */
  tone?: Tone;
  /** Called on confirm. The dialog stays open: close it (or set `busy`) from the caller. */
  onConfirm: () => void;
  /** Confirm shows a spinner; cancel, Escape and the backdrop are disabled. */
  busy?: boolean;
};

/**
 * Explicit confirmation before an expensive or irreversible step (e.g. a transaction of ≥ 1 MON).
 * `role="alertdialog"`, focus starts on Cancel, and a click on the backdrop does not dismiss it.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "neutral",
  onConfirm,
  busy = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const Icon = tone === "neutral" ? null : toneIcon[tone];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent
        role="alertdialog"
        showClose={false}
        aria-busy={busy || undefined}
        {...(description ? {} : { "aria-describedby": undefined })}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <div className="flex items-start gap-4">
          {Icon && (
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-control border", toneSoft[tone], toneText[tone])}>
              <Icon aria-hidden className="size-5" />
            </span>
          )}
          <DialogHeader className="min-w-0 pr-0">
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        </div>
        {children}
        <DialogFooter>
          <Button ref={cancelRef} variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "liq" ? "alarm" : "primary"} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Volume2, VolumeX } from "lucide-react";
import type { ComponentProps } from "react";
import type { CommonMessages } from "@/i18n/messages/common";
import { cn } from "@/lib/utils";
import { playCue } from "./engine";
import { useSoundEnabled } from "./use-cue";

/**
 * Sound on/off (off by default). A toggle button: the name stays "Sound effects", `aria-pressed`
 * carries the state and the tooltip says it. Turning it on plays one tick as confirmation (the click
 * is the user gesture that unlocks audio).
 */
export function SoundToggle({ t, className, showLabel = false, ...props }: { t: CommonMessages["sound"]; showLabel?: boolean } & ComponentProps<"button">) {
  const [on, setOn] = useSoundEnabled();
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={showLabel ? undefined : t.label}
      title={on ? t.on : t.off}
      onClick={() => {
        const next = !on;
        setOn(next);
        if (next) playCue("tick");
      }}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center gap-2 rounded-control border border-line-2 px-2 text-fg-3",
        "transition-colors duration-(--dur-fast) ease-out-quart hover:border-line-3 hover:text-fg-1",
        "aria-pressed:border-line-3 aria-pressed:text-fg-1",
        className,
      )}
      {...props}
    >
      <Icon className="size-3.5" aria-hidden />
      {showLabel && <span className="text-body-sm">{t.label}</span>}
    </button>
  );
}

"use client";

import { Volume2, VolumeX } from "lucide-react";
import type { ComponentProps } from "react";
import type { CommonMessages } from "@/i18n/messages/common";
import { SOUND_TOGGLE_ICON, SOUND_TOGGLE_ROW } from "./sound-toggle-styles";
import { useSoundEnabled } from "./use-sound-enabled";

/**
 * Sound on/off (off by default). A toggle button: the name stays "Sound effects", `aria-pressed`
 * carries the state and the tooltip says it. Turning it on plays one tick as confirmation (the click
 * is the user gesture that unlocks audio). The synth (`./engine`) loads on that click, not with the
 * page: the toggle is in the nav on every page, and most visits never turn sound on.
 *
 * `className` replaces the default look: build it with `soundToggleClass({ showLabel, className })`
 * (`./sound-toggle-styles`), which merges with `cn` wherever it runs (the nav: on the server), so this
 * client file carries no tailwind-merge.
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
        if (next) void import("./engine").then(({ playCue }) => playCue("tick")).catch(() => {});
      }}
      className={className ?? (showLabel ? SOUND_TOGGLE_ROW : SOUND_TOGGLE_ICON)}
      {...props}
    >
      <Icon className="size-3.5" aria-hidden />
      {showLabel && <span className="text-body-sm">{t.label}</span>}
    </button>
  );
}

/**
 * Two synthesized cues on the Web Audio API: no library, no audio files.
 *
 * - "tick": a subtle click (a 2.4 kHz triangle blip, ~30 ms), for a wave or a step landing.
 * - "boom": a low thump (a sine sweeping 120 → 38 Hz with a soft sub layer, ~0.7 s), for the shock.
 *
 * Rules:
 * - Never plays before a user gesture. The AudioContext is created lazily, only after the page has
 *   had a click, tap or key press (`navigator.userActivation`, with a listener as the fallback), so
 *   browsers never log an autoplay warning and nothing sounds on load.
 * - The caller checks the viewer's preference (`useCue` does); this module only knows how to play.
 * - Reduced motion: cues still play when the viewer turned sound on (sound is not motion), but at
 *   half volume and with the boom's tail cut short, so they stay in the background.
 */

export type Cue = "tick" | "boom";

type AudioContextCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let gestured = false;

function listenForGesture() {
  if (typeof window === "undefined") return;
  const mark = () => {
    gestured = true;
    window.removeEventListener("pointerdown", mark, true);
    window.removeEventListener("keydown", mark, true);
  };
  window.addEventListener("pointerdown", mark, true);
  window.addEventListener("keydown", mark, true);
}
listenForGesture();

/** True once the viewer has interacted with the page. */
export function hasUserGesture(): boolean {
  if (typeof window === "undefined") return false;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return gestured || activation?.hasBeenActive === true;
}

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function envelope(ac: AudioContext, peak: number, attack: number, decay: number): GainNode {
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(ac.destination);
  return g;
}

function tone(ac: AudioContext, type: OscillatorType, from: number, to: number, sweep: number, gain: GainNode, stopAt: number) {
  const o = ac.createOscillator();
  const t = ac.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + sweep);
  o.connect(gain);
  o.start(t);
  o.stop(t + stopAt);
}

/**
 * Plays a cue. Returns false (and does nothing) before a user gesture, without Web Audio, or when
 * the context cannot start. `volume` scales the cue (0..1, default 1).
 */
export function playCue(cue: Cue, volume = 1): boolean {
  if (!hasUserGesture()) return false;
  const ac = context();
  if (!ac) return false;
  if (ac.state === "suspended") void ac.resume().catch(() => {});
  const reduced = prefersReducedMotion();
  const v = Math.max(0, Math.min(1, volume)) * (reduced ? 0.5 : 1);
  if (v === 0) return false;

  if (cue === "tick") {
    const g = envelope(ac, 0.05 * v, 0.002, 0.03);
    tone(ac, "triangle", 2400, 2400, 0, g, 0.04);
  } else {
    const tail = reduced ? 0.3 : 0.65;
    tone(ac, "sine", 120, 38, tail * 0.8, envelope(ac, 0.45 * v, 0.006, tail), tail + 0.02);
    tone(ac, "triangle", 62, 45, tail * 0.6, envelope(ac, 0.12 * v, 0.004, tail * 0.7), tail + 0.02);
  }
  return true;
}

/** Tests only. */
export function resetAudioForTests(): void {
  ctx = null;
  gestured = false;
  listenForGesture();
}

/** Tests only: pretend the viewer has clicked. */
export function markGestureForTests(): void {
  gestured = true;
}

/**
 * Frame-time guard for an on-demand canvas. drei's PerformanceMonitor counts frames per second, which
 * reads idle time as slowness when frames are only drawn on change (`frameloop="demand"`). This guard
 * only measures runs of consecutive frames (scrolling, playback, parallax): a gap longer than
 * `idleGapMs` ends a run, and the first frames of a run are skipped. It compares the median interval
 * of a window with the display's own refresh interval. Pure: feed it frame timestamps.
 */

export type QualityName = "low" | "medium" | "high";

/** Render settings per quality level; the guard steps down one level at a time. */
export const QUALITY_LEVELS = [
  { name: "low", dprMax: 1, bloom: false, msaa: 0 },
  { name: "medium", dprMax: 1.25, bloom: true, msaa: 0 },
  { name: "high", dprMax: 1.75, bloom: true, msaa: 4 },
] as const satisfies readonly { name: QualityName; dprMax: number; bloom: boolean; msaa: number }[];

export type QualityLevel = 0 | 1 | 2;

export const qualityLevel = (name: QualityName): QualityLevel => (name === "low" ? 0 : name === "medium" ? 1 : 2);

export type FrameBudgetOptions = {
  /** Intervals per verdict. */
  window: number;
  /** A longer gap between two frames ends the run: the canvas was idle, not slow. */
  idleGapMs: number;
  /** Intervals skipped at the start of every run (start-up hiccups). */
  warmup: number;
  /** A window whose median exceeds this (and 1.5× the refresh interval) is over budget. */
  budgetMs: number;
  /** Fast windows in a row before stepping back up. */
  goodWindows: number;
  /** How often the guard may step back up (no flip-flopping). */
  maxInclines: number;
};

export const DEFAULT_FRAME_BUDGET: FrameBudgetOptions = { window: 24, idleGapMs: 250, warmup: 2, budgetMs: 20, goodWindows: 5, maxInclines: 1 };

export type FrameVerdict = "decline" | "incline" | null;

/** A device slow from its first frame must still step down: assume a 60 Hz display until shown otherwise. */
const ASSUMED_REFRESH_MS = 1000 / 60;

export class FrameBudget {
  private readonly options: FrameBudgetOptions;
  private intervals: number[] = [];
  private last: number | null = null;
  private run = 0;
  /** Display refresh interval: 60 Hz until faster frames show a faster display. */
  private refresh = ASSUMED_REFRESH_MS;
  private good = 0;
  private inclines = 0;
  /** Median interval of the last complete window (ms), for readouts. */
  median: number | null = null;

  constructor(options: Partial<FrameBudgetOptions> = {}) {
    this.options = { ...DEFAULT_FRAME_BUDGET, ...options };
  }

  /** Display refresh interval (ms): the fastest frames seen, at most 1000 / 60. */
  get refreshMs(): number {
    return this.refresh;
  }

  /** Feeds the timestamp (ms) of a drawn frame; says when the quality should change. */
  sample(now: number): FrameVerdict {
    const last = this.last;
    this.last = now;
    if (last === null) return null;
    const dt = now - last;
    if (!(dt > 0) || dt > this.options.idleGapMs) {
      this.run = 0;
      return null;
    }
    this.run++;
    if (this.run <= this.options.warmup) return null;
    this.refresh = Math.min(this.refresh, Math.max(dt, 4));
    this.intervals.push(dt);
    if (this.intervals.length < this.options.window) return null;

    const sorted = [...this.intervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.median = median;
    this.intervals = [];
    if (median > Math.max(this.options.budgetMs, this.refresh * 1.5)) {
      this.good = 0;
      return "decline";
    }
    if (median < this.refresh * 1.2) {
      this.good++;
      if (this.good >= this.options.goodWindows && this.inclines < this.options.maxInclines) {
        this.good = 0;
        this.inclines++;
        return "incline";
      }
    } else this.good = 0;
    return null;
  }

  /** Forgets the current run (after a quality change, whose first frames recompile and resize). */
  reset(): void {
    this.last = null;
    this.run = 0;
    this.intervals = [];
  }
}

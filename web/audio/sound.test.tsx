import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commonMessages } from "@/i18n/messages/common";
import { markGestureForTests, playCue, resetAudioForTests } from "./engine";
import { SoundToggle } from "./sound-toggle";
import { isSoundEnabled, resetSoundStoreForTests, setSoundEnabled, SOUND_STORAGE_KEY } from "./store";
import { useCue } from "./use-cue";

/** Records what the synth does instead of making sound. */
class FakeAudioContext {
  static instances = 0;
  static oscillators = 0;
  state = "running";
  currentTime = 0;
  destination = {};
  constructor() {
    FakeAudioContext.instances++;
  }
  resume() {
    return Promise.resolve();
  }
  createGain() {
    const param = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    return { gain: param, connect: vi.fn() };
  }
  createOscillator() {
    FakeAudioContext.oscillators++;
    const param = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    return { type: "sine", frequency: param, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  }
}

beforeEach(() => {
  window.localStorage.clear();
  resetSoundStoreForTests();
  resetAudioForTests();
  FakeAudioContext.instances = 0;
  FakeAudioContext.oscillators = 0;
  vi.stubGlobal("AudioContext", FakeAudioContext);
});

afterEach(() => vi.unstubAllGlobals());

const t = commonMessages.en.sound;

describe("sound preference", () => {
  it("is off by default", () => {
    expect(isSoundEnabled()).toBe(false);
    render(<SoundToggle t={t} />);
    expect(screen.getByRole("button", { name: "Sound effects" })).toHaveAttribute("aria-pressed", "false");
  });

  it("persists the choice per viewer", async () => {
    const user = userEvent.setup();
    render(<SoundToggle t={t} />);
    const button = screen.getByRole("button", { name: "Sound effects" });
    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem(SOUND_STORAGE_KEY)).toBe("on");
    resetSoundStoreForTests();
    expect(isSoundEnabled()).toBe(true);

    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem(SOUND_STORAGE_KEY)).toBeNull();
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(isSoundEnabled()).toBe(false);
    expect(() => setSoundEnabled(true)).not.toThrow();
    expect(isSoundEnabled()).toBe(true);
    vi.restoreAllMocks();
  });

  it("uses the Turkish copy under /tr", () => {
    render(<SoundToggle t={commonMessages.tr.sound} showLabel />);
    expect(screen.getByRole("button", { name: "Ses efektleri" })).toHaveAttribute("title", "Ses kapalı");
  });

  it("plays a confirmation tick when switched on (the synth loads on that click)", async () => {
    const user = userEvent.setup();
    render(<SoundToggle t={t} />);
    await user.click(screen.getByRole("button", { name: "Sound effects" }));
    await waitFor(() => expect(FakeAudioContext.oscillators).toBe(1));
    expect(FakeAudioContext.instances).toBe(1);
  });
});

describe("useCue", () => {
  it("plays nothing while sound is off, and never creates an AudioContext", () => {
    markGestureForTests();
    const { result } = renderHook(() => useCue());
    expect(result.current("boom")).toBe(false);
    expect(result.current("tick")).toBe(false);
    expect(FakeAudioContext.instances).toBe(0);
  });

  it("plays once sound is on and the viewer has interacted", () => {
    act(() => setSoundEnabled(true));
    const { result } = renderHook(() => useCue());
    markGestureForTests();
    expect(result.current("boom")).toBe(true);
    expect(FakeAudioContext.oscillators).toBe(2);
  });
});

describe("playCue", () => {
  it("waits for a user gesture", () => {
    expect(playCue("tick")).toBe(false);
    expect(FakeAudioContext.instances).toBe(0);
    markGestureForTests();
    expect(playCue("tick")).toBe(true);
  });

  it("does nothing without Web Audio or at zero volume", () => {
    markGestureForTests();
    expect(playCue("tick", 0)).toBe(false);
    vi.stubGlobal("AudioContext", undefined);
    resetAudioForTests();
    markGestureForTests();
    expect(playCue("boom")).toBe(false);
  });
});

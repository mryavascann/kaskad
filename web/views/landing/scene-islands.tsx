"use client";

/**
 * The shock scene's lazy islands: the stage (poster, then the WebGL scene) and the live readouts.
 * The server renders each one at the scene's first frame; their code loads and hydrates after the
 * reader's first intent (`deferred`), when the scene can start to move. Until then the server HTML
 * is what the reader sees, and nothing of the scene runs while the page loads.
 */
import { deferred } from "./deferred";

export const LiveStage = deferred(() => import("./scene-stage").then((m) => m.SceneStage));
export const LiveWaveCounter = deferred(() => import("./shock-live").then((m) => m.WaveCounter));
export const LivePriceLine = deferred(() => import("./shock-live").then((m) => m.PriceLine));
export const LiveReplayStrip = deferred(() => import("./shock-live").then((m) => m.ReplayStrip));

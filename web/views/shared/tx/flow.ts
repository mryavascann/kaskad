/**
 * Progress of one transaction flow as a list of steps, driven by the typed events of
 * lib/chain/status.ts. Steps that may or may not happen (funding the burner, a wallet signature) are
 * inserted only when their event arrives, so a finished flow never shows a step that did not run.
 */
import type { StepStatus } from "@/design/ui/steps";
import type { TxEvent, TxErrorCode } from "@/lib/chain/status";

export type FlowStepId = "check" | "prepare" | "fund" | "sign" | "send" | "confirm";
export type FlowItem = { id: FlowStepId; status: StepStatus };
export type FlowState = { items: FlowItem[]; error: TxErrorCode | "reverted" | null };

/** Order in which optional steps are slotted in. */
const RANK: Record<FlowStepId, number> = { check: 0, prepare: 1, fund: 2, sign: 3, send: 4, confirm: 5 };

export function startFlow(base: FlowStepId[]): FlowState {
  const items = [...base].sort((a, b) => RANK[a] - RANK[b]).map((id, i): FlowItem => ({ id, status: i === 0 ? "active" : "pending" }));
  return { items, error: null };
}

function activate(state: FlowState, id: FlowStepId): FlowState {
  let items = state.items;
  if (!items.some((s) => s.id === id)) {
    items = [...items, { id, status: "pending" as StepStatus }].sort((a, b) => RANK[a.id] - RANK[b.id]);
  }
  const at = RANK[id];
  return {
    ...state,
    items: items.map((s): FlowItem => {
      if (RANK[s.id] < at) return { ...s, status: s.status === "error" ? "error" : "done" };
      if (s.id === id) return { ...s, status: "active" };
      // A step inserted before the running one (funding after the pre-check) puts it back in line.
      return s.status === "active" ? { ...s, status: "pending" } : s;
    }),
  };
}

const STEP_OF: Partial<Record<TxEvent["step"], FlowStepId>> = {
  preparing: "prepare",
  funding: "fund",
  signing: "sign",
  sending: "send",
  confirming: "confirm",
};

export function applyEvent(state: FlowState, ev: TxEvent): FlowState {
  if (ev.step === "confirmed") return { ...state, items: state.items.map((s) => ({ ...s, status: "done" })) };
  if (ev.step === "failed") return failFlow(state, ev.detail);
  const id = STEP_OF[ev.step];
  return id ? activate(state, id) : state;
}

/** Marks the running step as failed (or the first unfinished one). */
export function failFlow(state: FlowState, code: TxErrorCode | "reverted"): FlowState {
  const current = state.items.findIndex((s) => s.status === "active");
  const target = current >= 0 ? current : state.items.findIndex((s) => s.status !== "done");
  return {
    error: code,
    items: state.items.map((s, i): FlowItem => (i === target ? { ...s, status: "error" } : s)),
  };
}

/** A pre-check passed (free eth_call): move on to the next step. */
export function passCheck(state: FlowState): FlowState {
  const next = state.items.find((s) => s.id !== "check");
  return next ? activate(state, next.id) : state;
}

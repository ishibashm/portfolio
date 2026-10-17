// Shared across server route bundles in this process; never persisted or shared across instances.
type BillingState = {
  paused: "billing" | null;
  lastBillingAt: string | null;
  revision: number;
};
const processState = globalThis as typeof globalThis & {
  __agentBillingState?: BillingState;
};
function state(): BillingState {
  return (processState.__agentBillingState ??= {
    paused: null,
    lastBillingAt: null,
    revision: 0,
  });
}
export function agentBillingState() {
  return { ...state() };
}
export function recordAgentBillingFailure() {
  Object.assign(state(), {
    paused: "billing",
    lastBillingAt: new Date().toISOString(),
    revision: state().revision + 1,
  });
}
export function recordAgentModelSuccess(startRevision: number) {
  // An older in-flight response must not clear a newer billing failure.
  if (state().revision === startRevision) state().paused = null;
}

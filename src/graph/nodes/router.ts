import type { DomainPack } from "@/domains/types";
import { executeCheckpoint } from "@/graph/runtime";
import type { GraphState } from "@/graph/state";

export function makeRouter(pack: DomainPack) {
  return async (state: GraphState, config: { configurable?: Record<string, unknown> }) => {
    const { state: patch, edge } = await executeCheckpoint(state, config, pack, "router");
    return {
      ...patch,
      routerEdge: edge,
      toolName: edge === "tool" ? patch.detail ?? "" : state.toolName,
      pendingConfirmation: patch.detail === "confirmation_required" || patch.detail === "page_oncall",
      outcome: edge === "handoff" ? "handoff" : edge === "clarify" ? "clarify" : state.outcome,
    };
  };
}

import type { DomainPack } from "@/domains/types";
import { executeCheckpoint } from "@/graph/runtime";
import type { GraphState } from "@/graph/state";

export function makeContextCheck(pack: DomainPack) {
  return async (state: GraphState, config: { configurable?: Record<string, unknown> }) => {
    const { state: patch, edge } = await executeCheckpoint(state, config, pack, "contextCheck");
    return {
      ...patch,
      contextEdge: edge,
      outcome: edge === "clarify" ? "clarify" : state.outcome,
    };
  };
}

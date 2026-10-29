import type { DomainPack } from "@/domains/types";
import { executeCheckpoint } from "@/graph/runtime";
import type { GraphState } from "@/graph/state";

export function makeVerify(pack: DomainPack) {
  return async (state: GraphState, config: { configurable?: Record<string, unknown> }) => {
    const { state: patch, edge } = await executeCheckpoint(state, config, pack, "verifier");
    return {
      ...patch,
      verifierEdge: edge,
      outcome: edge === "pass" ? "answer" : edge === "handoff" ? "handoff" : state.outcome,
    };
  };
}

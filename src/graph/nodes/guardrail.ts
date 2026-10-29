import type { DomainPack } from "@/domains/types";
import { executeCheckpoint } from "@/graph/runtime";
import type { GraphState } from "@/graph/state";
import { redactSecrets } from "@/lib/redact";

export function makeGuardrail(pack: DomainPack) {
  return async (state: GraphState, config: { configurable?: Record<string, unknown> }) => {
    const { state: patch, edge } = await executeCheckpoint(state, config, pack, "guardrail");
    const redact = patch.detail === "redact" || edge === "pass" && state.detail === "redact";
    const query = patch.detail === "redact" ? redactSecrets(state.query) : state.query;
    return {
      ...patch,
      guardrailEdge: edge,
      query,
      effectiveQuery: query,
      secretsWarning:
        patch.detail === "redact"
          ? "Credential-like text was removed from the working notes. Rotate any exposed credential."
          : state.secretsWarning,
      outcome: edge === "blocked" ? "blocked" : state.outcome,
    };
  };
}

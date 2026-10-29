import type { GraphState } from "@/graph/state";
import type { Mode } from "@/types/contracts";

export function blankState(input: {
  requestId: string;
  domainId: string;
  mode: Mode;
  query: string;
  runId?: string;
}): GraphState {
  return {
    requestId: input.requestId,
    runId: input.runId ?? "",
    domainId: input.domainId,
    mode: input.mode,
    query: input.query,
    effectiveQuery: input.query,
    rewriteCount: 0,
    regenCount: 0,
    chunks: [],
    toolName: "",
    toolResult: "",
    draft: "",
    finalResponse: "",
    outcome: "",
    guardrailEdge: "",
    routerEdge: "",
    contextEdge: "",
    verifierEdge: "",
    detail: "",
    secretsWarning: "",
    pendingConfirmation: false,
    costUsd: 0,
    latencyMs: 0,
    llmDecisionCalls: 0,
    jevCalls: 0,
    generationCalls: 0,
    embeddingCalls: 0,
    decisions: [],
    steps: [],
    error: "",
  };
}

import { incidentTools } from "@/domains/incident/tools";
import type { GraphState } from "@/graph/state";
import type { CheckpointOutcome, NormalizedAnswer } from "@/types/contracts";

function noul(answers: Record<string, NormalizedAnswer>, key: string): number {
  const answer = answers[key];
  return answer?.type === "noul" ? answer.probability : 0;
}

function choice(answers: Record<string, NormalizedAnswer>, key: string): string {
  const answer = answers[key];
  return answer?.type === "choice" ? answer.choice : "";
}

function bucket(answers: Record<string, NormalizedAnswer>, key: string): number {
  const answer = answers[key];
  return answer?.type === "score" ? answer.bucket : 0;
}

const writeTools = new Set(incidentTools.filter((tool) => tool.sideEffect).map((tool) => tool.name));

export function incidentGuardrailPolicy(answers: Record<string, NormalizedAnswer>): CheckpointOutcome {
  if (noul(answers, "is_incident") < 0.5) return { edge: "blocked", detail: "noise" };
  if (noul(answers, "prompt_injection") > 0.5) return { edge: "blocked", detail: "prompt_injection" };
  if (noul(answers, "contains_secrets") > 0.5) return { edge: "pass", detail: "redact" };
  return { edge: "pass" };
}

export function incidentRouterPolicy(answers: Record<string, NormalizedAnswer>): CheckpointOutcome {
  if (bucket(answers, "severity") === 3) return { edge: "handoff", detail: "page_oncall" };
  const action = choice(answers, "action");
  const tool = choice(answers, "tool");
  if (action === "call_tool" && writeTools.has(tool)) return { edge: "handoff", detail: "confirmation_required" };
  if (action === "page_oncall") return { edge: "handoff", detail: "page_oncall" };
  if (action === "clarify") return { edge: "clarify" };
  if (action === "call_tool") return { edge: "tool", detail: tool };
  return { edge: "answer", detail: choice(answers, "component") };
}

export function incidentContextPolicy(
  answers: Record<string, NormalizedAnswer>,
  state: GraphState,
): CheckpointOutcome {
  const raw = choice(answers, "best_chunk");
  const match = /^c(\d+)$/.exec(raw);
  const reorderChunk = match?.[1] ? Number(match[1]) : undefined;
  if (noul(answers, "sufficient") >= 0.5) return { edge: "sufficient", reorderChunk };
  if (state.rewriteCount < 2) return { edge: "rewrite", reorderChunk };
  return { edge: "clarify", detail: "context_exhausted" };
}

export function incidentVerifierPolicy(
  answers: Record<string, NormalizedAnswer>,
  state: GraphState,
): CheckpointOutcome {
  const pass = noul(answers, "grounded") > 0.5 && noul(answers, "unsafe_action") < 0.5;
  if (pass) return { edge: "pass" };
  if (state.regenCount < 1) return { edge: "regenerate" };
  return { edge: "handoff", detail: "verifier_exhausted" };
}

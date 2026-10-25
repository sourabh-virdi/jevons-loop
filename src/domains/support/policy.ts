import { supportTools } from "@/domains/support/tools";
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

const writeTools = new Set(supportTools.filter((tool) => tool.sideEffect).map((tool) => tool.name));

export function supportGuardrailPolicy(answers: Record<string, NormalizedAnswer>): CheckpointOutcome {
  if (noul(answers, "in_scope") < 0.5) return { edge: "blocked", detail: "out_of_scope" };
  if (noul(answers, "prompt_injection") > 0.5) return { edge: "blocked", detail: "prompt_injection" };
  if (noul(answers, "abusive") > 0.5) return { edge: "blocked", detail: "abusive" };
  return { edge: "pass" };
}

export function supportRouterPolicy(
  answers: Record<string, NormalizedAnswer>,
): CheckpointOutcome {
  const action = choice(answers, "action");
  const tool = choice(answers, "tool");
  if (action === "call_tool" && writeTools.has(tool) && noul(answers, "needs_human") > 0.5) {
    return { edge: "handoff", detail: "confirmation_required" };
  }
  if (action === "call_tool") return { edge: "tool", detail: tool };
  if (action === "clarify") return { edge: "clarify" };
  if (action === "handoff") return { edge: "handoff" };
  return { edge: "answer", detail: choice(answers, "intent") };
}

export function supportContextPolicy(
  answers: Record<string, NormalizedAnswer>,
  state: GraphState,
): CheckpointOutcome {
  const reorder = chunkIndex(choice(answers, "best_chunk"));
  if (noul(answers, "sufficient") >= 0.5) return { edge: "sufficient", reorderChunk: reorder };
  if (state.rewriteCount < 2) return { edge: "rewrite", reorderChunk: reorder };
  return { edge: "clarify", detail: "context_exhausted" };
}

export function supportVerifierPolicy(
  answers: Record<string, NormalizedAnswer>,
  state: GraphState,
): CheckpointOutcome {
  const pass =
    noul(answers, "grounded") > 0.5 &&
    noul(answers, "policy_violation") < 0.5 &&
    bucket(answers, "quality") >= 2;
  if (pass) return { edge: "pass" };
  if (state.regenCount < 1) return { edge: "regenerate" };
  return { edge: "handoff", detail: "verifier_exhausted" };
}

export function chunkIndex(choiceKey: string): number | undefined {
  const match = /^c(\d+)$/.exec(choiceKey);
  if (!match?.[1]) return undefined;
  const index = Number(match[1]);
  return index >= 0 && index <= 7 ? index : undefined;
}

export function reorderChunks<T>(chunks: T[], index: number | undefined): T[] {
  if (index === undefined || index <= 0 || index >= chunks.length) return chunks;
  const next = [...chunks];
  const [chosen] = next.splice(index, 1);
  if (chosen === undefined) return chunks;
  return [chosen, ...next];
}

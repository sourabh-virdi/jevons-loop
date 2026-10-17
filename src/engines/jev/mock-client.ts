import type { QuestionSet } from "@/engines/jev/types";
import type { DecisionCall, JevClient } from "@/engines/types";
import type { DecisionResult, NormalizedAnswer } from "@/types/contracts";

export function mockDecisionAnswers(
  questions: QuestionSet,
  state: unknown,
  variant: "jev" | "llm",
): Record<string, NormalizedAnswer> {
  const text = JSON.stringify(state).toLowerCase();
  const rewriteCount = readNumber(state, "rewriteCount");
  const regenCount = readNumber(state, "regenCount");
  const low = text.includes("[low-confidence]");
  const answers: Record<string, NormalizedAnswer> = {};

  for (const [key, question] of Object.entries(questions)) {
    if (question.type === "noul") {
      const probability = noulProbability(key, text, rewriteCount, regenCount);
      answers[key] = {
        type: "noul",
        probability,
        confidence: low ? 0.42 : Math.max(probability, 1 - probability),
      };
    } else if (question.type === "choice") {
      const keys = Object.keys(question.criteria);
      let choice = pickChoice(key, question.criteria, text);
      if (variant === "llm") {
        const index = Math.max(0, keys.indexOf(choice));
        choice = keys[(index + 1) % keys.length] ?? choice;
      }
      const confidence = low ? 0.42 : 0.92;
      answers[key] = {
        type: "choice",
        choice,
        probabilities: distribute(choice, keys, confidence),
        confidence,
      };
    } else {
      const bucket = scoreBucketFor(key, text, question.criteria.length);
      const confidence = low ? 0.42 : 0.9;
      answers[key] = {
        type: "score",
        score: bucket + 0.1,
        bucket,
        probabilities: { [String(bucket)]: confidence },
        confidence,
      };
    }
  }
  return answers;
}

export class MockJevClient implements JevClient {
  async decide(input: DecisionCall): Promise<DecisionResult> {
    return {
      engine: "jev",
      answers: mockDecisionAnswers(input.questions, input.state, "jev"),
      latencyMs: 1,
      costUsd: 0.00002,
      inputTokens: 120,
      outputTokens: 24,
      rawModelId: `${input.model}-mock`,
      cacheHit: false,
    };
  }
}

function readNumber(state: unknown, key: string): number {
  if (!state || typeof state !== "object" || !(key in state)) return 0;
  const value = (state as Record<string, unknown>)[key];
  return typeof value === "number" ? value : 0;
}

function noulProbability(key: string, text: string, rewriteCount: number, regenCount: number): number {
  if (key === "prompt_injection") {
    return text.includes("[inject]") || text.includes("ignore previous instructions") ? 0.97 : 0.03;
  }
  if (key === "abusive") return text.includes("[abuse]") ? 0.93 : 0.04;
  if (key === "in_scope") {
    if (text.includes("[oos]") || /weather|pizza|football|tell me a joke/.test(text)) return 0.06;
    return 0.96;
  }
  if (key === "is_incident") {
    if (text.includes("[oos]") || /weather|pizza|joke/.test(text)) return 0.08;
    return 0.95;
  }
  if (key === "contains_secrets") {
    return text.includes("[secrets]") || text.includes("api_key=") || text.includes("bearer ") ? 0.96 : 0.04;
  }
  if (key === "needs_human") {
    return text.includes("freeze") || text.includes("create a ticket") || text.includes("create an incident")
      ? 0.92
      : 0.08;
  }
  if (key === "sufficient") {
    if (text.includes("[insufficient]") && rewriteCount < 1) return 0.18;
    if (text.includes("unrelated family") || text.includes("[negative-context]")) return 0.12;
    return 0.93;
  }
  if (key === "grounded") {
    if (text.includes("unsupported_claim") || text.includes("refunded $500")) return 0.08;
    if (text.includes("[verify-fail-hard]")) return 0.08;
    if (text.includes("[verify-fail]") && regenCount === 0) return 0.12;
    return 0.94;
  }
  if (key === "answers_question" || key === "actionable" || key === "known_pattern") return 0.9;
  if (key === "policy_violation") {
    return text.includes("another customer's") || text.includes("guarantee a full refund") ? 0.95 : 0.04;
  }
  if (key === "unsafe_action") {
    return text.includes("rm -rf") || text.includes("mkfs") ? 0.96 : 0.03;
  }
  return 0.9;
}

function pickChoice(key: string, criteria: Record<string, string>, text: string): string {
  const keys = Object.keys(criteria);
  const has = (name: string) => keys.includes(name);
  if (has("handoff") || has("page_oncall") || has("answer_from_kb") || has("lookup_runbook") || has("call_tool")) {
    if (text.includes("[handoff]") || text.includes("speak to a human") || text.includes("human manager")) {
      if (has("handoff")) return "handoff";
      if (has("page_oncall")) return "page_oncall";
    }
    if (text.includes("page oncall") || text.includes("fatal") || text.includes("[sev1]")) {
      if (has("page_oncall")) return "page_oncall";
    }
    if (text.includes("[clarify]")) return has("clarify") ? "clarify" : keys[0] ?? "clarify";
    if (
      text.includes("[tool]") ||
      text.includes("freeze my card") ||
      text.includes("create a ticket") ||
      text.includes("create an incident")
    ) {
      if (has("call_tool")) return "call_tool";
    }
    if (has("answer_from_kb")) return "answer_from_kb";
    if (has("lookup_runbook")) return "lookup_runbook";
  }
  if (has("freezeCard") || has("none") || key === "tool") {
    if (text.includes("freeze")) return has("freezeCard") ? "freezeCard" : bestOverlap(criteria, text);
    if (text.includes("transaction")) return has("getRecentTransactions") ? "getRecentTransactions" : bestOverlap(criteria, text);
    if (text.includes("top up") || text.includes("top-up") || text.includes("topup")) {
      return has("getTopUpStatus") ? "getTopUpStatus" : bestOverlap(criteria, text);
    }
    if (text.includes("deploy")) return has("getRecentDeploys") ? "getRecentDeploys" : bestOverlap(criteria, text);
    if (text.includes("ticket")) return has("createIncidentTicket") ? "createIncidentTicket" : bestOverlap(criteria, text);
    if (text.includes("service status")) return has("getServiceStatus") ? "getServiceStatus" : bestOverlap(criteria, text);
    if (text.includes("search logs") || text.includes("[logs]")) return has("searchLogs") ? "searchLogs" : bestOverlap(criteria, text);
    if (has("none")) return "none";
  }
  return bestOverlap(criteria, text);
}

function bestOverlap(criteria: Record<string, string>, text: string): string {
  const keys = Object.keys(criteria);
  let best = keys[0] ?? "";
  let bestScore = -1;
  for (const key of keys) {
    const label = `${key} ${criteria[key] ?? ""}`.toLowerCase().replace(/[_?]/g, " ");
    const words = label.split(/[^a-z0-9]+/).filter((word) => word.length > 3);
    let score = 0;
    for (const word of words) if (text.includes(word)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}

function scoreBucketFor(key: string, text: string, levels: number): number {
  if (key === "severity") {
    if (text.includes("[sev1]") || text.includes("fatal") || text.includes("outage")) return Math.min(3, levels - 1);
    if (text.includes("error") || text.includes("fail")) return Math.min(2, levels - 1);
    if (text.includes("warn") || text.includes("degraded")) return Math.min(1, levels - 1);
    return 0;
  }
  if (text.includes("unusable")) return 0;
  return Math.min(3, levels - 1);
}

function distribute(choice: string, keys: string[], confidence: number): Record<string, number> {
  const probabilities: Record<string, number> = { [choice]: confidence };
  const rest = keys.filter((key) => key !== choice);
  const share = rest.length === 0 ? 0 : (1 - confidence) / rest.length;
  for (const key of rest.slice(0, 3)) probabilities[key] = Number(share.toFixed(4));
  return probabilities;
}

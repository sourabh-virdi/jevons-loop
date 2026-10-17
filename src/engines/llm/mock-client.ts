import { mockDecisionAnswers } from "@/engines/jev/mock-client";
import { normalizeLlmDecision } from "@/engines/llm/decision";
import type { DecisionCall, LlmClient } from "@/engines/types";
import type { DecisionResult, GenerationResult, JudgeScores } from "@/types/contracts";

export class MockLlmClient implements LlmClient {
  async decide(input: DecisionCall): Promise<DecisionResult> {
    const answers = mockDecisionAnswers(input.questions, input.state, "llm");
    const shaped = toSchemaShape(answers);
    return {
      engine: "llm",
      answers: normalizeLlmDecision(shaped, input.questions),
      latencyMs: 2,
      costUsd: 0.00008,
      inputTokens: 220,
      outputTokens: 40,
      rawModelId: `${input.model}-mock`,
      cacheHit: false,
    };
  }

  async generate(input: {
    model: string;
    system: string;
    prompt: string;
    onToken?: (token: string) => void;
  }): Promise<GenerationResult> {
    const text = mockProse(input.system, input.prompt);
    const tokens = text.split(/(\s+)/);
    for (const token of tokens) input.onToken?.(token);
    return {
      text,
      latencyMs: 3,
      costUsd: 0.00015,
      inputTokens: 300,
      outputTokens: 80,
      rawModelId: `${input.model}-mock`,
    };
  }

  async embed(): Promise<{ embeddings: number[][]; costUsd: number }> {
    return { embeddings: [], costUsd: 0 };
  }

  async judge(input: { model: string; prompt: string }): Promise<{ scores: JudgeScores; costUsd: number; latencyMs: number }> {
    const grounded = input.prompt.toLowerCase().includes("unsupported_claim") ? 1 : 5;
    const scores = { correct: 4, grounded, helpful: 4, mean: Number(((4 + grounded + 4) / 3).toFixed(2)) };
    return { scores, costUsd: 0.0002, latencyMs: 2 };
  }
}

function toSchemaShape(answers: Record<string, import("@/types/contracts").NormalizedAnswer>): Record<string, unknown> {
  const shaped: Record<string, unknown> = {};
  for (const [key, answer] of Object.entries(answers)) {
    if (answer.type === "noul") shaped[key] = { probability: answer.probability };
    else if (answer.type === "choice") shaped[key] = { choice: answer.choice, confidence: answer.confidence };
    else shaped[key] = { bucket: answer.bucket, confidence: answer.confidence };
  }
  return shaped;
}

function mockProse(system: string, prompt: string): string {
  const lower = `${system}\n${prompt}`.toLowerCase();
  if (lower.includes("clarifying")) {
    return lower.includes("incident")
      ? "Which service and time window should I triage?"
      : "Could you share the last four digits of the card and the time of the attempt?";
  }
  if (lower.includes("rewrite")) {
    const query = prompt.split("Query:").at(1)?.trim() ?? prompt;
    return `${query} banking support knowledge base`.slice(0, 400);
  }
  if (lower.includes("triage") || lower.includes("probable cause")) {
    return [
      "Probable cause: the log window matches a known operational pattern in the runbook.",
      "Affected component: see the retrieved runbook.",
      "Severity rationale: the signal is above informational noise and needs a checked next step.",
      "Next steps:",
      "1. Confirm the affected service status with the on-call owner.",
      "2. Follow the retrieved runbook. Do not run destructive commands without confirmation.",
    ].join("\n");
  }
  return [
    "Based on the knowledge base, here is the relevant guidance for your request.",
    prompt.slice(0, 280),
    "No account change was made.",
  ].join("\n");
}

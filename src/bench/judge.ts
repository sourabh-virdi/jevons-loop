import { getEnv } from "@/config/env";
import type { LlmClient } from "@/engines/types";
import { bootstrapMeanCi } from "@/bench/metrics";
import type { JudgeScores } from "@/types/contracts";

export async function judgeAnswers(
  llm: LlmClient,
  items: Array<{ question: string; answer: string; context: string }>,
): Promise<{ scores: JudgeScores[]; mean: number; low: number; high: number; costUsd: number }> {
  const env = getEnv();
  const scores: JudgeScores[] = [];
  let costUsd = 0;
  for (const item of items) {
    const prompt = [
      "Rubric: score each dimension from 1 to 5.",
      "correct: the answer addresses the question.",
      "grounded: claims are supported by the context.",
      "helpful: a customer or operator could act on it.",
      `Question: ${item.question}`,
      `Context: ${item.context}`,
      `Answer: ${item.answer}`,
    ].join("\n");
    const judged = await llm.judge({ model: env.LLM_JUDGE_MODEL, prompt });
    scores.push(judged.scores);
    costUsd += judged.costUsd;
  }
  const ci = bootstrapMeanCi(scores.map((score) => score.mean));
  return { scores, mean: ci.mean, low: ci.low, high: ci.high, costUsd };
}

export function agreementRate(verifierGrounded: boolean[], judgeGrounded: number[]): number {
  const n = Math.min(verifierGrounded.length, judgeGrounded.length);
  if (n === 0) return 0;
  let agree = 0;
  for (let i = 0; i < n; i += 1) {
    const judgeSaysGrounded = (judgeGrounded[i] ?? 0) >= 4;
    if (verifierGrounded[i] === judgeSaysGrounded) agree += 1;
  }
  return agree / n;
}

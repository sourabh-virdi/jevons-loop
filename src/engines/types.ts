import type { QuestionSet } from "@/engines/jev/types";
import type { DecisionResult, GenerationResult, JudgeScores } from "@/types/contracts";

export interface DecisionCall {
  model: string;
  state: unknown;
  questions: QuestionSet;
}

export interface JevClient {
  decide(input: DecisionCall): Promise<DecisionResult>;
}

export interface LlmClient {
  decide(input: DecisionCall): Promise<DecisionResult>;
  generate(input: {
    model: string;
    system: string;
    prompt: string;
    onToken?: (token: string) => void;
  }): Promise<GenerationResult>;
  embed(input: { model: string; texts: string[] }): Promise<{ embeddings: number[][]; costUsd: number }>;
  judge(input: { model: string; prompt: string }): Promise<{ scores: JudgeScores; costUsd: number; latencyMs: number }>;
}

export type { DecisionResult };

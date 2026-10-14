import type { CHECKPOINTS, MODES } from "@/config/constants";

export type Mode = (typeof MODES)[number];
export type CheckpointName = (typeof CHECKPOINTS)[number];
export type DomainId = "support" | "incident";
export type Split = "train" | "validation" | "test";

export type NormalizedAnswer =
  | { type: "noul"; probability: number; confidence: number }
  | {
      type: "choice";
      choice: string;
      probabilities: Record<string, number>;
      confidence: number;
    }
  | {
      type: "score";
      score: number;
      bucket: number;
      probabilities: Record<string, number>;
      confidence: number;
    };

export interface DecisionResult {
  engine: "jev" | "llm";
  answers: Record<string, NormalizedAnswer>;
  latencyMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  rawModelId: string;
  cacheHit: boolean;
  error?: string;
}

export interface DecisionTrace {
  requestId: string;
  runId?: string;
  domainId: string;
  mode: Mode;
  checkpoint: CheckpointName;
  attempt: number;
  primary: DecisionResult;
  fallback?: DecisionResult;
  escalated: boolean;
  escalationReason?: string;
  outcome: string;
  stateHash: string;
  timestamp: string;
  disagreement: boolean;
  statePreview: string;
  thresholds: Record<string, number>;
}

export interface StepTrace {
  requestId: string;
  runId?: string;
  domainId: string;
  mode: Mode;
  node: "tool" | "retrieve" | "rewrite" | "generate" | "clarify" | "finalize";
  latencyMs: number;
  costUsd: number;
  outputPreview: string;
  timestamp: string;
}

export interface CheckpointOutcome {
  edge: string;
  detail?: string;
  reorderChunk?: number;
}

export interface GenerationResult {
  text: string;
  latencyMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  rawModelId: string;
}

export interface JudgeScores {
  correct: number;
  grounded: number;
  helpful: number;
  mean: number;
}

export interface FinalPayload {
  requestId: string;
  runId?: string;
  domainId: string;
  mode: Mode;
  finalResponse: string;
  outcome: string;
  costUsd: number;
  latencyMs: number;
}

import type { CheckpointName, Mode, Split } from "@/types/contracts";
import type { ReliabilityBin } from "@/bench/metrics";

export interface CheckpointMetrics {
  accuracy: number;
  macroF1?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  severityMae?: number;
  severityExact?: number;
  ece: { jev?: number; llm?: number };
  brier: { jev?: number; llm?: number };
  reliability: {
    jev?: ReliabilityBin[];
    llm?: ReliabilityBin[];
  };
  questions?: Record<string, {
    ece: { jev?: number; llm?: number };
    brier: { jev?: number; llm?: number };
    reliability: { jev?: ReliabilityBin[]; llm?: ReliabilityBin[] };
  }>;
  escalationRate: number;
  latencyP50: number | null;
  latencyP95: number | null;
}

export interface RunMetrics {
  domainId: string;
  mode: Mode;
  split: Split;
  sampleSize: number;
  seed: number;
  checkpoints: Partial<Record<CheckpointName, CheckpointMetrics>>;
  answerQuality: { mean: number; low: number; high: number; n: number };
  judgeAgreement: number;
  costPer1k: number;
  costSplit: { jev: number; llmDecisions: number; llmGeneration: number; embeddings: number };
  latencyP50: number | null;
  latencyP95: number | null;
  llmDecisionCalls: number;
  jevCalls: number;
  cacheHitRate: number;
  requests: number;
}

export interface SweepPoint {
  question: string;
  threshold: number;
  accuracy: number;
  escalationRate: number;
  costPer1k: number;
}

export interface SweepPayload {
  domainId: string;
  checkpoint: CheckpointName;
  split: Split;
  baselineAccuracy: number;
  tolerance: number;
  points: SweepPoint[];
  pareto: SweepPoint[];
  chosen?: SweepPoint;
}

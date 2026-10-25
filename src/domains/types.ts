import type { QuestionSet } from "@/engines/jev/types";
import type { GraphState } from "@/graph/state";
import type { CheckpointName, CheckpointOutcome, NormalizedAnswer, Split } from "@/types/contracts";
import type { z } from "zod";

export interface DatasetExample {
  id: string;
  text: string;
  gold: {
    intent?: string;
    component?: string;
    severity?: number;
    family?: string;
  };
}

export interface DatasetAdapter {
  load(split: Split): DatasetExample[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  sideEffect: boolean;
  inputSchema: z.ZodType;
  execute: (input: unknown) => unknown;
}

export interface CheckpointConfig<S> {
  questions: QuestionSet;
  gatingQuestions: string[];
  buildState: (state: S) => unknown;
  policy: (answers: Record<string, NormalizedAnswer>, state: S) => CheckpointOutcome;
  defaultThresholds: Record<string, number>;
  /**
   * Optional runtime question binding. Used when a choice's options depend on
   * retrieved chunks (context-check `best_chunk`, max 8).
   */
  resolveQuestions?: (state: S) => QuestionSet;
}

export interface DomainPack {
  id: string;
  displayName: string;
  description: string;
  dataset: DatasetAdapter;
  corpus: { dir: string; chunkSize: number; chunkOverlap: number };
  tools: ToolDefinition[];
  checkpoints: Record<CheckpointName, CheckpointConfig<GraphState>>;
  prompts: { system: string; generate: string; rewrite: string; clarify: string };
  templates: { blocked: string; handoff: string };
  samplePrompts: string[];
}

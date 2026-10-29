import { Annotation } from "@langchain/langgraph";
import type { DecisionTrace, Mode, StepTrace } from "@/types/contracts";

export interface RetrievedChunk {
  id: string;
  text: string;
  source: string;
  family: string;
  score: number;
}

export interface GraphState {
  requestId: string;
  runId: string;
  domainId: string;
  mode: Mode;
  query: string;
  effectiveQuery: string;
  rewriteCount: number;
  regenCount: number;
  chunks: RetrievedChunk[];
  toolName: string;
  toolResult: string;
  draft: string;
  finalResponse: string;
  outcome: string;
  guardrailEdge: string;
  routerEdge: string;
  contextEdge: string;
  verifierEdge: string;
  detail: string;
  secretsWarning: string;
  pendingConfirmation: boolean;
  costUsd: number;
  latencyMs: number;
  llmDecisionCalls: number;
  jevCalls: number;
  generationCalls: number;
  embeddingCalls: number;
  decisions: DecisionTrace[];
  steps: StepTrace[];
  error: string;
}

const replace = <T>(fallback: T) =>
  Annotation<T>({
    reducer: (_left: T, right: T) => right,
    default: () => fallback,
  });

export const GraphAnnotation = Annotation.Root({
  requestId: replace(""),
  runId: replace(""),
  domainId: replace(""),
  mode: replace<Mode>("hybrid"),
  query: replace(""),
  effectiveQuery: replace(""),
  rewriteCount: replace(0),
  regenCount: replace(0),
  chunks: replace<RetrievedChunk[]>([]),
  toolName: replace(""),
  toolResult: replace(""),
  draft: replace(""),
  finalResponse: replace(""),
  outcome: replace(""),
  guardrailEdge: replace(""),
  routerEdge: replace(""),
  contextEdge: replace(""),
  verifierEdge: replace(""),
  detail: replace(""),
  secretsWarning: replace(""),
  pendingConfirmation: replace(false),
  costUsd: replace(0),
  latencyMs: replace(0),
  llmDecisionCalls: replace(0),
  jevCalls: replace(0),
  generationCalls: replace(0),
  embeddingCalls: replace(0),
  decisions: Annotation<DecisionTrace[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  steps: Annotation<StepTrace[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  error: replace(""),
});

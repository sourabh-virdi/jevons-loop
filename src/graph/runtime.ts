import { getEnv } from "@/config/env";
import { SqliteModelCache, type ModelCache } from "@/decision/cache";
import { DecisionEngine } from "@/decision/engine";
import { createJevClient } from "@/engines/jev/index";
import { createLlmClient } from "@/engines/llm/client";
import type { JevClient, LlmClient } from "@/engines/types";
import type { DomainPack } from "@/domains/types";
import { reorderChunks } from "@/domains/support/policy";
import type { GraphState } from "@/graph/state";
import { getDb } from "@/db/client";
import { thresholds as thresholdTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { TraceSink } from "@/observability/trace";
import type { CheckpointName, DecisionTrace, StepTrace } from "@/types/contracts";
import { preview } from "@/lib/redact";

export interface AgentConfigurable {
  sink?: TraceSink;
  jev?: JevClient;
  llm?: LlmClient;
  cache?: ModelCache;
}

export function readConfigurable(config: { configurable?: Record<string, unknown> } | undefined): AgentConfigurable {
  const raw = config?.configurable;
  if (!raw) return {};
  const value: AgentConfigurable = {};
  if (isSink(raw.sink)) value.sink = raw.sink;
  if (isJev(raw.jev)) value.jev = raw.jev;
  if (isLlm(raw.llm)) value.llm = raw.llm;
  if (isCache(raw.cache)) value.cache = raw.cache;
  return value;
}

export function loadThresholdOverrides(domainId: string): Record<string, Record<string, number>> {
  const rows = getDb().select().from(thresholdTable).where(eq(thresholdTable.domainId, domainId)).all();
  const map: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    map[row.checkpoint] ??= {};
    map[row.checkpoint]![row.question] = row.value;
  }
  return map;
}

export async function executeCheckpoint(
  state: GraphState,
  config: { configurable?: Record<string, unknown> } | undefined,
  pack: DomainPack,
  checkpoint: CheckpointName,
): Promise<{ state: Partial<GraphState>; edge: string; trace: DecisionTrace }> {
  const env = getEnv();
  const configurable = readConfigurable(config);
  const engine = new DecisionEngine({
    jev: configurable.jev ?? createJevClient(),
    llm: configurable.llm ?? createLlmClient(),
    cache: configurable.cache ?? new SqliteModelCache(),
    tokenBudget: env.JEV_STATE_TOKEN_BUDGET,
    cacheEnabled: env.CACHE_MODEL_CALLS,
  });
  const overrides = loadThresholdOverrides(pack.id)[checkpoint];
  const started = Date.now();
  const result = await engine.decide({
    requestId: state.requestId,
    runId: state.runId || undefined,
    domainId: pack.id,
    mode: state.mode,
    checkpoint,
    attempt: checkpoint === "contextCheck" ? state.rewriteCount : checkpoint === "verifier" ? state.regenCount : 0,
    state,
    config: pack.checkpoints[checkpoint],
    thresholdOverrides: overrides,
    jevModel: env.JEV_MODEL,
    llmModel: env.LLM_MODEL,
  });
  configurable.sink?.decision(result.trace);
  const chunks =
    result.outcome.reorderChunk !== undefined ? reorderChunks(state.chunks, result.outcome.reorderChunk) : state.chunks;
  const delta = result.trace.primary.costUsd + (result.trace.fallback?.costUsd ?? 0);
  const jevCalls = (result.trace.primary.engine === "jev" ? 1 : 0) + (result.trace.fallback?.engine === "jev" ? 1 : 0);
  const llmDecisionCalls =
    (result.trace.primary.engine === "llm" ? 1 : 0) + (result.trace.fallback?.engine === "llm" ? 1 : 0);
  return {
    edge: result.outcome.edge,
    trace: result.trace,
    state: {
      decisions: [result.trace],
      chunks,
      detail: result.outcome.detail ?? state.detail,
      costUsd: state.costUsd + delta,
      latencyMs: state.latencyMs + (Date.now() - started),
      jevCalls: state.jevCalls + jevCalls,
      llmDecisionCalls: state.llmDecisionCalls + llmDecisionCalls,
    },
  };
}

export function emitStep(
  state: GraphState,
  config: { configurable?: Record<string, unknown> } | undefined,
  node: StepTrace["node"],
  started: number,
  output: string,
  costUsd = 0,
): StepTrace {
  const step: StepTrace = {
    requestId: state.requestId,
    runId: state.runId || undefined,
    domainId: state.domainId,
    mode: state.mode,
    node,
    latencyMs: Date.now() - started,
    costUsd,
    outputPreview: preview(output, 240),
    timestamp: new Date().toISOString(),
  };
  readConfigurable(config).sink?.step(step);
  return step;
}

function isSink(value: unknown): value is TraceSink {
  return typeof value === "object" && value !== null && "decision" in value && "step" in value;
}

function isJev(value: unknown): value is JevClient {
  return typeof value === "object" && value !== null && "decide" in value && !("generate" in value);
}

function isLlm(value: unknown): value is LlmClient {
  return typeof value === "object" && value !== null && "generate" in value && "decide" in value;
}

function isCache(value: unknown): value is ModelCache {
  return typeof value === "object" && value !== null && "get" in value && "set" in value;
}

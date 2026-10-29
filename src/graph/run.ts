import { randomUUID } from "node:crypto";
import { getDomain } from "@/domains/registry";
import { buildGraph } from "@/graph/build-graph";
import type { GraphState } from "@/graph/state";
import { rememberRequest, type TraceSink } from "@/observability/trace";
import type { FinalPayload, Mode } from "@/types/contracts";
import type { JevClient, LlmClient } from "@/engines/types";
import type { ModelCache } from "@/decision/cache";

export interface RunInput {
  query: string;
  domainId: string;
  mode: Mode;
  requestId?: string;
  runId?: string;
  sink?: TraceSink;
  jev?: JevClient;
  llm?: LlmClient;
  cache?: ModelCache;
}

export async function runRequest(input: RunInput): Promise<GraphState & { final: FinalPayload }> {
  const pack = getDomain(input.domainId);
  const requestId = input.requestId ?? randomUUID();
  const started = Date.now();
  rememberRequest({
    requestId,
    runId: input.runId,
    domainId: pack.id,
    mode: input.mode,
    inputText: input.query,
  });
  const graph = buildGraph(pack);
  const output = await graph.invoke(
    {
      requestId,
      runId: input.runId ?? "",
      domainId: pack.id,
      mode: input.mode,
      query: input.query,
      effectiveQuery: input.query,
    },
    {
      configurable: {
        sink: input.sink,
        jev: input.jev,
        llm: input.llm,
        cache: input.cache,
      },
      recursionLimit: 25,
    },
  );
  const state = output as GraphState;
  const final: FinalPayload = {
    requestId,
    runId: input.runId,
    domainId: pack.id,
    mode: input.mode,
    finalResponse: state.finalResponse,
    outcome: state.outcome,
    costUsd: state.costUsd,
    latencyMs: Date.now() - started,
  };
  input.sink?.final(final);
  return { ...state, latencyMs: final.latencyMs, final };
}

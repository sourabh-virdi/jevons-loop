import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import { decisions, requests } from "@/db/schema";
import { log } from "@/lib/logger";
import type { DecisionTrace, FinalPayload, StepTrace } from "@/types/contracts";

export interface TraceSink {
  decision(event: DecisionTrace): void;
  step(event: StepTrace): void;
  token(text: string): void;
  final(payload: FinalPayload): void;
  error(message: string): void;
}

export function createDbSink(extra?: Partial<TraceSink>): TraceSink {
  return {
    decision(event) {
      getDb()
        .insert(decisions)
        .values({
          id: randomUUID(),
          requestId: event.requestId,
          runId: event.runId,
          domainId: event.domainId,
          mode: event.mode,
          checkpoint: event.checkpoint,
          attempt: event.attempt,
          primaryJson: JSON.stringify(event.primary),
          fallbackJson: event.fallback ? JSON.stringify(event.fallback) : null,
          escalated: event.escalated ? 1 : 0,
          escalationReason: event.escalationReason,
          outcome: event.outcome,
          stateHash: event.stateHash,
          disagreement: event.disagreement ? 1 : 0,
          statePreview: event.statePreview,
          thresholdsJson: JSON.stringify(event.thresholds),
          timestamp: event.timestamp,
        })
        .run();
      log("info", "decision", {
        requestId: event.requestId,
        checkpoint: event.checkpoint,
        outcome: event.outcome,
        escalated: event.escalated,
        costUsd: event.primary.costUsd + (event.fallback?.costUsd ?? 0),
      });
      extra?.decision?.(event);
    },
    step(event) {
      log("info", "step", { requestId: event.requestId, node: event.node, latencyMs: event.latencyMs });
      extra?.step?.(event);
    },
    token(text) {
      extra?.token?.(text);
    },
    final(payload) {
      getDb()
        .insert(requests)
        .values({
          id: payload.requestId,
          runId: payload.runId,
          domainId: payload.domainId,
          mode: payload.mode,
          inputText: "",
          outputText: payload.finalResponse,
          outcome: payload.outcome,
          latencyMs: payload.latencyMs,
          costUsd: payload.costUsd,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: requests.id,
          set: {
            outputText: payload.finalResponse,
            outcome: payload.outcome,
            latencyMs: payload.latencyMs,
            costUsd: payload.costUsd,
          },
        })
        .run();
      extra?.final?.(payload);
    },
    error(message) {
      log("error", "request failed", { message });
      extra?.error?.(message);
    },
  };
}

export function rememberRequest(input: {
  requestId: string;
  runId?: string;
  domainId: string;
  mode: string;
  inputText: string;
}): void {
  getDb()
    .insert(requests)
    .values({
      id: input.requestId,
      runId: input.runId,
      domainId: input.domainId,
      mode: input.mode,
      inputText: input.inputText,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();
}

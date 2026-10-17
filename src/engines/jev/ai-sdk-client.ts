import { experimental_evaluate as evaluate } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getEnv } from "@/config/env";
import { normalizeAiSdkResult, toAiSdkQuestions } from "@/engines/jev/normalize";
import type { DecisionCall, JevClient } from "@/engines/types";
import { EngineError, withRetry } from "@/lib/retry";
import type { DecisionResult } from "@/types/contracts";

export type EvaluateFn = (input: {
  model: unknown;
  state: unknown;
  questions: Record<string, unknown>;
}) => Promise<unknown>;

export class AiSdkJevClient implements JevClient {
  constructor(private readonly evaluateFn: EvaluateFn = defaultEvaluate) {}

  async decide(input: DecisionCall): Promise<DecisionResult> {
    const started = Date.now();
    const payload = await withRetry(async () => {
      try {
        return await this.evaluateFn({
          model: input.model,
          state: input.state,
          questions: toAiSdkQuestions(input.questions),
        });
      } catch (error) {
        const status = readStatus(error);
        throw new EngineError("Jev AI SDK request failed", {
          retriable: status === undefined || status === 429 || status >= 500,
          status,
          cause: error,
        });
      }
    });
    const normalized = normalizeAiSdkResult(payload, input.questions, input.model);
    return {
      engine: "jev",
      answers: normalized.answers,
      latencyMs: Date.now() - started,
      costUsd: normalized.costUsd,
      inputTokens: normalized.inputTokens,
      outputTokens: normalized.outputTokens,
      rawModelId: normalized.rawModelId,
      cacheHit: false,
    };
  }
}

async function defaultEvaluate(input: {
  model: unknown;
  state: unknown;
  questions: Record<string, unknown>;
}): Promise<unknown> {
  const env = getEnv();
  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
  const modelId = typeof input.model === "string" ? input.model : env.JEV_MODEL;
  return evaluate({
    model: openrouter.evaluationModel(modelId),
    state: input.state as never,
    questions: input.questions as never,
  });
}

function readStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : undefined;
}

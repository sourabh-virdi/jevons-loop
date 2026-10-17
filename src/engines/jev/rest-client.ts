import { getEnv } from "@/config/env";
import { normalizeRestResponse } from "@/engines/jev/normalize";
import type { JevClient, DecisionCall } from "@/engines/types";
import { EngineError, withRetry } from "@/lib/retry";
import type { DecisionResult } from "@/types/contracts";

export class RestJevClient implements JevClient {
  constructor(
    private readonly options?: {
      fetchFn?: typeof fetch;
      apiKey?: string;
      url?: string;
    },
  ) {}

  async decide(input: DecisionCall): Promise<DecisionResult> {
    const env = getEnv();
    const fetchFn = this.options?.fetchFn ?? fetch;
    const url = this.options?.url ?? env.JEV_DECISIONS_URL;
    const apiKey = this.options?.apiKey ?? env.OPENROUTER_API_KEY;
    const started = Date.now();
    const payload = await withRetry(async () => {
      let response: Response;
      try {
        response = await fetchFn(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: input.model,
            state: input.state,
            questions: input.questions,
          }),
        });
      } catch (error) {
        throw new EngineError("Jev REST request failed", { retriable: true, cause: error });
      }
      if (response.status === 429 || response.status >= 500) {
        throw new EngineError(`Jev REST HTTP ${response.status}`, {
          retriable: true,
          status: response.status,
        });
      }
      if (!response.ok) {
        throw new EngineError(`Jev REST HTTP ${response.status}`, {
          retriable: false,
          status: response.status,
        });
      }
      return response.json() as Promise<unknown>;
    });
    const normalized = normalizeRestResponse(payload, input.questions);
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

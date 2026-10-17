import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { embedMany, generateObject, generateText, streamText } from "ai";
import { z } from "zod";
import { getEnv } from "@/config/env";
import { buildLlmDecisionSchema, DECISION_SYSTEM, normalizeLlmDecision, renderDecisionPrompt } from "@/engines/llm/decision";
import { MockLlmClient } from "@/engines/llm/mock-client";
import { readReportedCost } from "@/engines/llm/usage";
import type { DecisionCall, LlmClient } from "@/engines/types";
import { EngineError, withRetry } from "@/lib/retry";
import type { DecisionResult, GenerationResult, JudgeScores } from "@/types/contracts";

const JudgeSchema = z.object({
  correct: z.number().min(1).max(5),
  grounded: z.number().min(1).max(5),
  helpful: z.number().min(1).max(5),
});

export class OpenRouterLlmClient implements LlmClient {
  private readonly provider: ReturnType<typeof createOpenRouter>;

  constructor(apiKey = getEnv().OPENROUTER_API_KEY) {
    this.provider = createOpenRouter({ apiKey });
  }

  private model(modelId: string) {
    return this.provider(modelId, { usage: { include: true } });
  }

  async decide(input: DecisionCall): Promise<DecisionResult> {
    const started = Date.now();
    const result = await withRetry(async () => {
      try {
        return await generateObject({
          model: this.model(input.model),
          schema: buildLlmDecisionSchema(input.questions),
          system: DECISION_SYSTEM,
          prompt: renderDecisionPrompt(input.state, input.questions),
        });
      } catch (error) {
        throw wrapLlm(error);
      }
    });
    const answers = normalizeLlmDecision(result.object, input.questions);
    return {
      engine: "llm",
      answers,
      latencyMs: Date.now() - started,
      costUsd: readReportedCost(result.providerMetadata),
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      rawModelId: input.model,
      cacheHit: false,
    };
  }

  async generate(input: {
    model: string;
    system: string;
    prompt: string;
    onToken?: (token: string) => void;
  }): Promise<GenerationResult> {
    const started = Date.now();
    if (input.onToken) {
      const result = streamText({
        model: this.model(input.model),
        system: input.system,
        prompt: input.prompt,
      });
      let text = "";
      for await (const token of result.textStream) {
        text += token;
        input.onToken(token);
      }
      const usage = await result.usage;
      const metadata = await result.providerMetadata;
      return {
        text,
        latencyMs: Date.now() - started,
        costUsd: readReportedCost(metadata),
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        rawModelId: input.model,
      };
    }
    const result = await withRetry(async () => {
      try {
        return await generateText({
          model: this.model(input.model),
          system: input.system,
          prompt: input.prompt,
        });
      } catch (error) {
        throw wrapLlm(error);
      }
    });
    return {
      text: result.text,
      latencyMs: Date.now() - started,
      costUsd: readReportedCost(result.providerMetadata),
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      rawModelId: input.model,
    };
  }

  async embed(input: { model: string; texts: string[] }): Promise<{ embeddings: number[][]; costUsd: number }> {
    if (input.texts.length === 0) return { embeddings: [], costUsd: 0 };
    const result = await withRetry(async () => {
      try {
        return await embedMany({
          model: this.provider.textEmbeddingModel(input.model),
          values: input.texts,
        });
      } catch (error) {
        throw wrapLlm(error);
      }
    });
    return { embeddings: result.embeddings, costUsd: readReportedCost(result.providerMetadata) };
  }

  async judge(input: { model: string; prompt: string }): Promise<{ scores: JudgeScores; costUsd: number; latencyMs: number }> {
    const started = Date.now();
    const result = await withRetry(async () => {
      try {
        return await generateObject({
          model: this.model(input.model),
          schema: JudgeSchema,
          system: "Score the answer from 1 to 5 for correct, grounded, and helpful. Use only the supplied material.",
          prompt: input.prompt,
        });
      } catch (error) {
        throw wrapLlm(error);
      }
    });
    const scores = result.object;
    const mean = Number(((scores.correct + scores.grounded + scores.helpful) / 3).toFixed(2));
    return {
      scores: { ...scores, mean },
      costUsd: readReportedCost(result.providerMetadata),
      latencyMs: Date.now() - started,
    };
  }
}

export function createLlmClient(): LlmClient {
  if (getEnv().JEV_TRANSPORT === "mock") return new MockLlmClient();
  return new OpenRouterLlmClient();
}

function wrapLlm(error: unknown): EngineError {
  const status = readStatus(error);
  return new EngineError("LLM request failed", {
    retriable: status === undefined || status === 429 || status >= 500,
    status,
    cause: error,
  });
}

function readStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("statusCode" in error && typeof error.statusCode === "number") return error.statusCode;
  if ("status" in error && typeof error.status === "number") return error.status;
  return undefined;
}

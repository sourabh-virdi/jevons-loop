import type { NormalizedAnswer } from "@/types/contracts";
import {
  AiSdkEvalSchema,
  JevRestResponseSchema,
  type AiSdkEval,
  type JevRestResponse,
  type QuestionSet,
  parseWithSchema,
} from "@/engines/jev/types";

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function noulConfidence(probability: number): number {
  const p = clamp01(probability);
  return Math.max(p, 1 - p);
}

function maxProbability(probabilities: Record<string, number> | undefined): number {
  const values = Object.values(probabilities ?? {});
  if (values.length === 0) return 0.5;
  return clamp01(Math.max(...values));
}

export function scoreBucket(score: number, levels: number): number {
  const rounded = Math.round(score);
  return Math.min(Math.max(rounded, 0), Math.max(0, levels - 1));
}

export function normalizeRestResponse(payload: unknown, questions: QuestionSet): {
  answers: Record<string, NormalizedAnswer>;
  rawModelId: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
} {
  const body: JevRestResponse = parseWithSchema(JevRestResponseSchema, payload, "Jev REST response");
  const answers: Record<string, NormalizedAnswer> = {};
  for (const [key, question] of Object.entries(questions)) {
    const raw = body.answers[key];
    if (!raw) {
      throw new Error(`Jev REST response is missing answer "${key}"`);
    }
    if (raw.type !== question.type) {
      throw new Error(`Jev REST answer "${key}" has type ${raw.type}, expected ${question.type}`);
    }
    if (raw.type === "noul") {
      const probability = clamp01(raw.noul);
      answers[key] = { type: "noul", probability, confidence: noulConfidence(probability) };
    } else if (raw.type === "choice") {
      answers[key] = {
        type: "choice",
        choice: raw.choice,
        probabilities: raw.probabilities,
        confidence: clamp01(raw.confidence ?? maxProbability(raw.probabilities)),
      };
    } else {
      const levels = question.type === "score" ? question.criteria.length : 1;
      answers[key] = {
        type: "score",
        score: raw.score,
        bucket: scoreBucket(raw.score, levels),
        probabilities: raw.probabilities,
        confidence: clamp01(raw.confidence ?? maxProbability(raw.probabilities)),
      };
    }
  }
  return {
    answers,
    rawModelId: body.model,
    costUsd: body.usage?.cost ?? 0,
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
  };
}

export function normalizeAiSdkResult(payload: unknown, questions: QuestionSet, requestedModel: string): {
  answers: Record<string, NormalizedAnswer>;
  rawModelId: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
} {
  const body: AiSdkEval = parseWithSchema(AiSdkEvalSchema, payload, "Jev AI SDK response");
  const metaAnswers = body.providerMetadata?.openrouter?.answers ?? {};
  const answers: Record<string, NormalizedAnswer> = {};
  for (const [key, question] of Object.entries(questions)) {
    const raw = body.answers[key];
    if (!raw) throw new Error(`Jev AI SDK response is missing answer "${key}"`);
    const metaConfidence = metaAnswers[key]?.confidence;
    if (question.type === "noul") {
      const probability = clamp01(raw.probability ?? 0);
      answers[key] = { type: "noul", probability, confidence: noulConfidence(probability) };
    } else if (question.type === "choice") {
      const probabilities = raw.probabilities ?? {};
      answers[key] = {
        type: "choice",
        choice: raw.choice ?? "",
        probabilities,
        confidence: clamp01(metaConfidence ?? raw.confidence ?? maxProbability(probabilities)),
      };
    } else {
      const score = raw.score ?? 0;
      const probabilities = raw.probabilities ?? {};
      answers[key] = {
        type: "score",
        score,
        bucket: scoreBucket(score, question.criteria.length),
        probabilities,
        confidence: clamp01(metaConfidence ?? raw.confidence ?? maxProbability(probabilities)),
      };
    }
  }
  return {
    answers,
    rawModelId: body.providerMetadata?.openrouter?.model ?? body.response?.modelId ?? requestedModel,
    costUsd: body.providerMetadata?.openrouter?.usage?.cost ?? 0,
    inputTokens: body.usage?.inputTokens ?? body.providerMetadata?.openrouter?.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.outputTokens ?? body.providerMetadata?.openrouter?.usage?.output_tokens ?? 0,
  };
}

/** Map Jev `noul` questions onto the AI SDK `boolean` question type. */
export function toAiSdkQuestions(questions: QuestionSet): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, question] of Object.entries(questions)) {
    if (question.type === "noul") {
      mapped[key] = {
        type: "boolean",
        instructions: question.instructions,
        ...(question.criteria ? { criteria: question.criteria } : {}),
      };
    } else {
      mapped[key] = question;
    }
  }
  return mapped;
}

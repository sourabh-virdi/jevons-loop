import { z } from "zod";
import type { QuestionSet } from "@/engines/jev/types";
import { ContractParseError } from "@/engines/jev/types";
import type { NormalizedAnswer } from "@/types/contracts";

export function buildLlmDecisionSchema(questions: QuestionSet) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, question] of Object.entries(questions)) {
    if (question.type === "noul") {
      shape[key] = z.object({ probability: z.number().min(0).max(1) });
    } else if (question.type === "choice") {
      const keys = Object.keys(question.criteria);
      const first = keys[0];
      if (!first) throw new Error(`Choice question ${key} has no options`);
      shape[key] = z.object({
        choice: z.enum([first, ...keys.slice(1)] as [string, ...string[]]),
        confidence: z.number().min(0).max(1),
      });
    } else {
      shape[key] = z.object({
        bucket: z.number().int().min(0).max(question.criteria.length - 1),
        confidence: z.number().min(0).max(1),
      });
    }
  }
  return z.object(shape);
}

export function renderDecisionPrompt(state: unknown, questions: QuestionSet): string {
  return [
    "Decide every question using only the state.",
    "Return one object with a key per question.",
    "noul answers are { probability: number from 0 to 1 }.",
    "choice answers are { choice, confidence } where choice is one of the option keys.",
    "score answers are { bucket, confidence } where bucket is an integer index from low to high.",
    "",
    "State:",
    JSON.stringify(state),
    "",
    "Questions:",
    JSON.stringify(questions),
  ].join("\n");
}

export const DECISION_SYSTEM =
  "You are a calibrated decision function. Do not write prose. Answer only the requested structured fields.";

export function normalizeLlmDecision(payload: unknown, questions: QuestionSet): Record<string, NormalizedAnswer> {
  const schema = buildLlmDecisionSchema(questions);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ContractParseError("LLM decision did not match the expected contract", parsed.error.issues);
  }
  const record = parsed.data as Record<string, { probability?: number; choice?: string; confidence?: number; bucket?: number }>;
  const answers: Record<string, NormalizedAnswer> = {};
  for (const [key, question] of Object.entries(questions)) {
    const value = record[key];
    if (!value) throw new ContractParseError(`LLM decision missing ${key}`, []);
    if (question.type === "noul") {
      const probability = value.probability ?? 0;
      answers[key] = {
        type: "noul",
        probability,
        confidence: Math.max(probability, 1 - probability),
      };
    } else if (question.type === "choice") {
      const confidence = value.confidence ?? 0;
      answers[key] = {
        type: "choice",
        choice: value.choice ?? "",
        probabilities: { [value.choice ?? ""]: confidence },
        confidence,
      };
    } else {
      const bucket = value.bucket ?? 0;
      const confidence = value.confidence ?? 0;
      answers[key] = {
        type: "score",
        score: bucket,
        bucket,
        probabilities: { [String(bucket)]: confidence },
        confidence,
      };
    }
  }
  return answers;
}

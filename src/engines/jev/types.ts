import { z } from "zod";

export const NoulQuestion = z.object({
  type: z.literal("noul"),
  instructions: z.string().min(1),
  criteria: z.object({ true: z.string(), false: z.string() }).optional(),
});

export const ChoiceQuestion = z.object({
  type: z.literal("choice"),
  instructions: z.string().min(1),
  criteria: z.record(z.string(), z.string()).refine((options) => {
    const count = Object.keys(options).length;
    return count >= 2 && count <= 255;
  }, "choice questions need between 2 and 255 options"),
});

export const ScoreQuestion = z.object({
  type: z.literal("score"),
  instructions: z.string().min(1),
  criteria: z.array(z.string().min(1)).min(2),
});

export const JevQuestion = z.discriminatedUnion("type", [NoulQuestion, ChoiceQuestion, ScoreQuestion]);

export const QuestionSetSchema = z.record(z.string(), JevQuestion);

export type JevQuestion = z.infer<typeof JevQuestion>;
export type QuestionSet = Record<string, JevQuestion>;

const UsageSchema = z
  .object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    cost: z.number().optional(),
  })
  .passthrough();

const NoulAnswerSchema = z
  .object({
    type: z.literal("noul"),
    noul: z.number(),
    confidence: z.number().optional(),
  })
  .passthrough();

const ChoiceAnswerSchema = z
  .object({
    type: z.literal("choice"),
    choice: z.string(),
    probabilities: z.record(z.string(), z.number()).default({}),
    confidence: z.number().optional(),
  })
  .passthrough();

const ScoreAnswerSchema = z
  .object({
    type: z.literal("score"),
    score: z.number(),
    legend: z.record(z.string(), z.string()).optional(),
    probabilities: z.record(z.string(), z.number()).default({}),
    confidence: z.number().optional(),
  })
  .passthrough();

export const JevAnswerSchema = z.discriminatedUnion("type", [
  NoulAnswerSchema,
  ChoiceAnswerSchema,
  ScoreAnswerSchema,
]);

export const JevRestResponseSchema = z
  .object({
    id: z.string().optional(),
    model: z.string().min(1),
    provider: z.string().optional(),
    answers: z.record(z.string(), JevAnswerSchema),
    usage: UsageSchema.optional(),
  })
  .passthrough();

export type JevRestResponse = z.infer<typeof JevRestResponseSchema>;

const AiSdkAnswerSchema = z
  .object({
    type: z.string().optional(),
    probability: z.number().optional(),
    choice: z.string().optional(),
    probabilities: z.record(z.string(), z.number()).optional(),
    score: z.number().optional(),
    confidence: z.number().optional(),
  })
  .passthrough();

export const AiSdkEvalSchema = z
  .object({
    answers: z.record(z.string(), AiSdkAnswerSchema),
    providerMetadata: z
      .object({
        openrouter: z
          .object({
            answers: z
              .record(
                z.string(),
                z
                  .object({
                    confidence: z.number().optional(),
                  })
                  .passthrough(),
              )
              .optional(),
            usage: UsageSchema.optional(),
            model: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    usage: z
      .object({
        inputTokens: z.number().optional(),
        outputTokens: z.number().optional(),
      })
      .passthrough()
      .optional(),
    response: z
      .object({
        modelId: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type AiSdkEval = z.infer<typeof AiSdkEvalSchema>;

export class ContractParseError extends Error {
  readonly code = "CONTRACT_PARSE";
  readonly issues: unknown;

  constructor(message: string, issues: unknown) {
    super(message);
    this.name = "ContractParseError";
    this.issues = issues;
  }
}

export function parseWithSchema<T>(schema: z.ZodType<T>, payload: unknown, label: string): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ContractParseError(`${label} did not match the expected contract`, parsed.error.issues);
  }
  return parsed.data;
}

import { z } from "zod";
import { JEV_DECISIONS_ENDPOINT, JEV_MODEL_PIN } from "@/config/constants";

const booleanFromEnv = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return value;
}, z.boolean());

export const EnvSchema = z
  .object({
    OPENROUTER_API_KEY: z.string().default(""),
    JEV_MODEL: z.string().min(1).default(JEV_MODEL_PIN),
    JEV_TRANSPORT: z.enum(["rest", "ai-sdk", "mock"]).default("rest"),
    JEV_DECISIONS_URL: z.string().url().default(JEV_DECISIONS_ENDPOINT),
    LLM_MODEL: z.string().min(1).default("openai/gpt-4o-mini"),
    LLM_JUDGE_MODEL: z.string().min(1).default("openai/gpt-4o"),
    EMBEDDING_MODEL: z.string().min(1).default("openai/text-embedding-3-small"),
    DEFAULT_DOMAIN: z.enum(["support", "incident"]).default("support"),
    DATABASE_URL: z.string().min(1).default("file:./data/app.db"),
    JEV_STATE_TOKEN_BUDGET: z.coerce.number().int().positive().default(8000),
    BENCH_CONCURRENCY: z.coerce.number().int().positive().default(8),
    CACHE_MODEL_CALLS: booleanFromEnv.default(true),
    SWEEP_TOLERANCE: z.coerce.number().positive().default(0.01),
  })
  .superRefine((value, ctx) => {
    if (value.JEV_TRANSPORT !== "mock" && value.OPENROUTER_API_KEY.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENROUTER_API_KEY"],
        message: "OPENROUTER_API_KEY is required unless JEV_TRANSPORT=mock",
      });
    }
    if (value.JEV_MODEL.includes("latest")) {
      ctx.addIssue({
        code: "custom",
        path: ["JEV_MODEL"],
        message: `Pin ${JEV_MODEL_PIN}. Rolling aliases are not allowed in benchmarks.`,
      });
    }
  });

export type AppEnv = z.infer<typeof EnvSchema>;

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment. Fix the variables below and restart.\n${details}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}

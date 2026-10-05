/** Pinned Jev model. Do not substitute a rolling alias in benchmarks. */
export const JEV_MODEL_PIN = "typesafe/jev-1.13";

/** OpenRouter Decisions API. Kept in config so clients do not inline it. */
export const JEV_DECISIONS_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";

export const CHECKPOINT_DEFAULTS = {
  guardrail: 0.85,
  router: 0.7,
  contextCheck: 0.75,
  verifier: 0.8,
} as const;

export const CHECKPOINTS = ["guardrail", "router", "contextCheck", "verifier"] as const;

export const MODES = ["baseline", "hybrid", "jev-only"] as const;

export const DOMAINS = ["support", "incident"] as const;

export const SPLITS = ["train", "validation", "test"] as const;

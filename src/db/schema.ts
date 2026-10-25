import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  domainId: text("domain_id").notNull(),
  mode: text("mode").notNull(),
  split: text("split").notNull(),
  sampleSize: integer("sample_size").notNull(),
  seed: integer("seed").notNull(),
  thresholdsJson: text("thresholds_json").notNull(),
  modelIdsJson: text("model_ids_json").notNull(),
  gitSha: text("git_sha").notNull(),
  status: text("status").notNull(),
  metricsJson: text("metrics_json"),
  costUsd: real("cost_usd").notNull().default(0),
  createdAt: text("created_at").notNull(),
  finishedAt: text("finished_at"),
  cacheHitRate: real("cache_hit_rate"),
  error: text("error"),
});

export const requests = sqliteTable("requests", {
  id: text("id").primaryKey(),
  runId: text("run_id"),
  domainId: text("domain_id").notNull(),
  mode: text("mode").notNull(),
  inputText: text("input_text").notNull(),
  outputText: text("output_text"),
  outcome: text("outcome"),
  latencyMs: real("latency_ms"),
  costUsd: real("cost_usd"),
  createdAt: text("created_at").notNull(),
  traceJson: text("trace_json"),
});

export const decisions = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  runId: text("run_id"),
  domainId: text("domain_id").notNull(),
  mode: text("mode").notNull(),
  checkpoint: text("checkpoint").notNull(),
  attempt: integer("attempt").notNull(),
  primaryJson: text("primary_json").notNull(),
  fallbackJson: text("fallback_json"),
  escalated: integer("escalated").notNull(),
  escalationReason: text("escalation_reason"),
  outcome: text("outcome").notNull(),
  stateHash: text("state_hash").notNull(),
  disagreement: integer("disagreement").notNull().default(0),
  statePreview: text("state_preview"),
  thresholdsJson: text("thresholds_json"),
  timestamp: text("timestamp").notNull(),
});

export const benchmarks = sqliteTable("benchmarks", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  metric: text("metric").notNull(),
  checkpoint: text("checkpoint"),
  valueJson: text("value_json").notNull(),
});

export const thresholds = sqliteTable("thresholds", {
  id: text("id").primaryKey(),
  domainId: text("domain_id").notNull(),
  checkpoint: text("checkpoint").notNull(),
  question: text("question").notNull(),
  value: real("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sweeps = sqliteTable("sweeps", {
  id: text("id").primaryKey(),
  domainId: text("domain_id").notNull(),
  checkpoint: text("checkpoint").notNull(),
  split: text("split").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const modelCache = sqliteTable("model_cache", {
  hash: text("hash").primaryKey(),
  engine: text("engine").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: text("created_at").notNull(),
});

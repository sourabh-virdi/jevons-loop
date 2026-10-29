import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import pLimit from "p-limit";
import { getEnv } from "@/config/env";
import { SqliteModelCache } from "@/decision/cache";
import { DecisionEngine } from "@/decision/engine";
import { confidenceFor } from "@/decision/confidence";
import { getDomain } from "@/domains/registry";
import type { DatasetExample } from "@/domains/types";
import { createJevClient } from "@/engines/jev/index";
import { createLlmClient } from "@/engines/llm/client";
import { getDb } from "@/db/client";
import { benchmarks, runs, thresholds as thresholdTable } from "@/db/schema";
import { blankState } from "@/graph/blank";
import { runRequest } from "@/graph/run";
import type { GraphState } from "@/graph/state";
import { createDbSink } from "@/observability/trace";
import { sampleSeeded } from "@/lib/rng";
import { log } from "@/lib/logger";
import {
  accuracy,
  binaryAccuracy,
  binaryF1,
  brierScore,
  costPerThousand,
  exactMatch,
  expectedCalibrationError,
  macroF1,
  meanAbsoluteError,
  percentile,
  reliabilityDiagram,
  type CalibrationPoint,
} from "@/bench/metrics";
import { buildContextSet, buildGuardrailSet, buildVerifierSet, type ContextExample, type VerifierExample } from "@/bench/labels";
import { agreementRate, judgeAnswers } from "@/bench/judge";
import type { CheckpointMetrics, RunMetrics } from "@/bench/types";
import type { CheckpointName, DecisionResult, Mode, NormalizedAnswer, Split } from "@/types/contracts";

export class CostCapError extends Error {
  constructor(readonly spent: number, readonly cap: number) {
    super(`Projected spend ${spent.toFixed(6)} exceeds --max-cost-usd ${cap}`);
    this.name = "CostCapError";
  }
}

export interface BenchOptions {
  domainId: string;
  mode: Mode;
  split: Split;
  n: number;
  seed: number;
  maxCostUsd?: number;
}

export async function runBenchmark(options: BenchOptions): Promise<{ id: string; metrics: RunMetrics; status: string }> {
  const env = getEnv();
  const pack = getDomain(options.domainId);
  const id = randomUUID();
  const sampled = sampleSeeded(pack.dataset.load(options.split), options.n, options.seed);
  const thresholdSnapshot = loadAllThresholds(pack.id);
  const modelIds = {
    jev: env.JEV_MODEL,
    llm: env.LLM_MODEL,
    judge: env.LLM_JUDGE_MODEL,
    embedding: env.EMBEDDING_MODEL,
    transport: env.JEV_TRANSPORT,
  };
  getDb().insert(runs).values({
    id,
    domainId: pack.id,
    mode: options.mode,
    split: options.split,
    sampleSize: sampled.length,
    seed: options.seed,
    thresholdsJson: JSON.stringify(thresholdSnapshot),
    modelIdsJson: JSON.stringify(modelIds),
    gitSha: gitSha(),
    status: "running",
    costUsd: 0,
    createdAt: new Date().toISOString(),
  }).run();

  let spent = 0;
  const charge = (amount: number) => {
    spent += amount;
    if (options.maxCostUsd !== undefined && spent > options.maxCostUsd) {
      throw new CostCapError(spent, options.maxCostUsd);
    }
  };

  try {
    const engine = new DecisionEngine({
      jev: createJevClient(),
      llm: createLlmClient(),
      cache: new SqliteModelCache(),
      tokenBudget: env.JEV_STATE_TOKEN_BUDGET,
      cacheEnabled: env.CACHE_MODEL_CALLS,
    });
    const guardrail = await evalGuardrail(engine, pack.id, options, sampled, thresholdSnapshot.guardrail, charge);
    const router = await evalRouter(engine, pack.id, options, sampled, thresholdSnapshot.router, charge);
    const context = await evalContext(engine, pack.id, options, sampled, thresholdSnapshot.contextCheck, charge);
    const verifier = await evalVerifier(engine, pack.id, options, sampled, thresholdSnapshot.verifier, charge);
    const e2e = await evalEndToEnd(pack.id, options, id, sampled, charge);
    const judgeSample = e2e.rows.slice(0, Math.min(100, e2e.rows.length));
    const judged = await judgeAnswers(
      createLlmClient(),
      judgeSample.map((row) => ({
        question: row.query,
        answer: row.answer,
        context: row.context,
      })),
    );
    charge(judged.costUsd);
    const metrics: RunMetrics = {
      domainId: pack.id,
      mode: options.mode,
      split: options.split,
      sampleSize: sampled.length,
      seed: options.seed,
      checkpoints: {
        guardrail: guardrail.metrics,
        router: router.metrics,
        contextCheck: context.metrics,
        verifier: verifier.metrics,
      },
      answerQuality: { mean: judged.mean, low: judged.low, high: judged.high, n: judged.scores.length },
      judgeAgreement: agreementRate(
        e2e.verifierGrounded.slice(0, judgeSample.length),
        judged.scores.map((score) => score.grounded),
      ),
      costPer1k: costPerThousand(spent, sampled.length),
      costSplit: e2e.costSplit,
      latencyP50: percentile(e2e.latencies, 50),
      latencyP95: percentile(e2e.latencies, 95),
      llmDecisionCalls: countEngine([guardrail, router, context, verifier], "llm") + e2e.llmDecisionCalls,
      jevCalls: countEngine([guardrail, router, context, verifier], "jev") + e2e.jevCalls,
      cacheHitRate: cacheRate([guardrail, router, context, verifier]),
      requests: sampled.length,
    };
    metrics.costSplit.llmGeneration += judged.costUsd;
    finishRun(id, "completed", metrics, spent);
    return { id, metrics, status: "completed" };
  } catch (error) {
    const status = error instanceof CostCapError ? "aborted" : "failed";
    const message = error instanceof Error ? error.message : "benchmark failed";
    getDb().update(runs).set({ status, error: message, finishedAt: new Date().toISOString(), costUsd: spent }).where(eq(runs.id, id)).run();
    log("error", "benchmark failed", { id, status, message });
    if (error instanceof CostCapError) return { id, metrics: emptyMetrics(options, sampled.length), status };
    throw error;
  }
}

function finishRun(id: string, status: string, metrics: RunMetrics, spent: number) {
  getDb().update(runs).set({
    status,
    metricsJson: JSON.stringify(metrics),
    costUsd: spent,
    cacheHitRate: metrics.cacheHitRate,
    finishedAt: new Date().toISOString(),
  }).where(eq(runs.id, id)).run();
  for (const [checkpoint, value] of Object.entries(metrics.checkpoints)) {
    getDb().insert(benchmarks).values({
      id: randomUUID(),
      runId: id,
      metric: "checkpoint",
      checkpoint,
      valueJson: JSON.stringify(value),
    }).run();
  }
}

async function evalGuardrail(
  engine: DecisionEngine,
  domainId: string,
  options: BenchOptions,
  sampled: DatasetExample[],
  overrides: Record<string, number> | undefined,
  charge: (n: number) => void,
) {
  const examples = buildGuardrailSet(domainId, sampled, options.seed);
  const rows: MetricRow[] = [];
  for (const example of examples) {
    const state = blankState({ requestId: randomUUID(), domainId, mode: options.mode, query: example.text, runId: "bench" });
    const decided = await engine.decide({
      requestId: state.requestId,
      domainId,
      mode: options.mode,
      checkpoint: "guardrail",
      attempt: 0,
      state,
      config: getDomain(domainId).checkpoints.guardrail,
      thresholdOverrides: overrides,
      jevModel: getEnv().JEV_MODEL,
      llmModel: getEnv().LLM_MODEL,
    });
    charge(costOf(decided.trace.primary) + costOf(decided.trace.fallback));
    rows.push({
      correct: (decided.outcome.edge === "blocked") === example.goldBlock,
      primary: decided.trace.primary,
      fallback: decided.trace.fallback,
      escalated: decided.trace.escalated,
      labels: {
        in_scope: { kind: "bool", value: example.goldInScope },
        prompt_injection: { kind: "bool", value: example.goldInjection },
        abusive: { kind: "bool", value: example.goldAbusive },
      },
    });
  }
  const pairs = rows.map((row) => ({ gold: examples[rows.indexOf(row)]!.goldBlock, pred: row.correct ? examples[rows.indexOf(row)]!.goldBlock : !examples[rows.indexOf(row)]!.goldBlock }));
  const scores = binaryF1(pairs.map((pair, index) => ({ gold: examples[index]!.goldBlock, pred: pair.pred })), true);
  return {
    metrics: summarize(rows, {
      accuracy: binaryAccuracy(pairs.map((pair, index) => ({ gold: examples[index]!.goldBlock, pred: pair.pred }))),
      precision: scores.precision,
      recall: scores.recall,
      f1: scores.f1,
    }, "in_scope"),
    calls: rows,
  };
}

async function evalRouter(
  engine: DecisionEngine,
  domainId: string,
  options: BenchOptions,
  sampled: DatasetExample[],
  overrides: Record<string, number> | undefined,
  charge: (n: number) => void,
) {
  const rows = [];
  const classPairs: Array<{ gold: string; pred: string }> = [];
  const severityPairs: Array<{ gold: number; pred: number }> = [];
  for (const example of sampled) {
    const state = blankState({ requestId: randomUUID(), domainId, mode: options.mode, query: example.text, runId: "bench" });
    const decided = await engine.decide({
      requestId: state.requestId,
      domainId,
      mode: options.mode,
      checkpoint: "router",
      attempt: 0,
      state,
      config: getDomain(domainId).checkpoints.router,
      thresholdOverrides: overrides,
      jevModel: getEnv().JEV_MODEL,
      llmModel: getEnv().LLM_MODEL,
    });
    charge(costOf(decided.trace.primary) + costOf(decided.trace.fallback));
    const answers = decided.answers;
    const labelKey = domainId === "support" ? "intent" : "component";
    const gold = (domainId === "support" ? example.gold.intent : example.gold.component) ?? "";
    const pred = answers[labelKey]?.type === "choice" ? answers[labelKey].choice : "";
    classPairs.push({ gold, pred });
    if (typeof example.gold.severity === "number" && answers.severity?.type === "score") {
      severityPairs.push({ gold: example.gold.severity, pred: answers.severity.bucket });
    }
    const labels: Record<string, GoldLabel> = { [labelKey]: { kind: "choice", value: gold } };
    if (typeof example.gold.severity === "number") labels.severity = { kind: "score", value: example.gold.severity };
    rows.push({ ...rowFrom(decided, pred === gold), labels });
  }
  return {
    metrics: summarize(rows, {
      accuracy: accuracy(classPairs),
      macroF1: macroF1(classPairs),
      severityMae: severityPairs.length ? meanAbsoluteError(severityPairs) : undefined,
      severityExact: severityPairs.length ? exactMatch(severityPairs) : undefined,
    }, domainId === "support" ? "intent" : "component"),
    calls: rows,
  };
}

async function evalContext(
  engine: DecisionEngine,
  domainId: string,
  options: BenchOptions,
  sampled: DatasetExample[],
  overrides: Record<string, number> | undefined,
  charge: (n: number) => void,
) {
  const examples: ContextExample[] = buildContextSet(domainId, sampled);
  const rows: MetricRow[] = [];
  const pairs: Array<{ gold: boolean; pred: boolean }> = [];
  for (const example of examples) {
    const state = withChunks(blankState({
      requestId: randomUUID(),
      domainId,
      mode: options.mode,
      query: example.text,
      runId: "bench",
    }), example.chunks);
    const decided = await engine.decide({
      requestId: state.requestId,
      domainId,
      mode: options.mode,
      checkpoint: "contextCheck",
      attempt: 0,
      state,
      config: getDomain(domainId).checkpoints.contextCheck,
      thresholdOverrides: overrides,
      jevModel: getEnv().JEV_MODEL,
      llmModel: getEnv().LLM_MODEL,
    });
    charge(costOf(decided.trace.primary) + costOf(decided.trace.fallback));
    const probability = decided.answers.sufficient?.type === "noul" ? decided.answers.sufficient.probability : 0;
    const pred = probability >= 0.5;
    pairs.push({ gold: example.sufficient, pred });
    rows.push({ ...rowFrom(decided, pred === example.sufficient), labels: { sufficient: { kind: "bool", value: example.sufficient } } });
  }
  return { metrics: summarize(rows, { accuracy: binaryAccuracy(pairs) }, "sufficient"), calls: rows };
}

async function evalVerifier(
  engine: DecisionEngine,
  domainId: string,
  options: BenchOptions,
  sampled: DatasetExample[],
  overrides: Record<string, number> | undefined,
  charge: (n: number) => void,
) {
  const examples: VerifierExample[] = buildVerifierSet(sampled);
  const rows: MetricRow[] = [];
  const pairs: Array<{ gold: boolean; pred: boolean }> = [];
  for (const example of examples) {
    const state = withChunks(blankState({
      requestId: randomUUID(),
      domainId,
      mode: options.mode,
      query: example.text,
      runId: "bench",
    }), [{ id: "ctx", text: example.context }]);
    state.draft = example.draft;
    const decided = await engine.decide({
      requestId: state.requestId,
      domainId,
      mode: options.mode,
      checkpoint: "verifier",
      attempt: 0,
      state,
      config: getDomain(domainId).checkpoints.verifier,
      thresholdOverrides: overrides,
      jevModel: getEnv().JEV_MODEL,
      llmModel: getEnv().LLM_MODEL,
    });
    charge(costOf(decided.trace.primary) + costOf(decided.trace.fallback));
    const probability = decided.answers.grounded?.type === "noul" ? decided.answers.grounded.probability : 0;
    const pred = probability > 0.5;
    pairs.push({ gold: example.grounded, pred });
    rows.push({
      ...rowFrom(decided, pred === example.grounded),
      labels: {
        grounded: { kind: "bool", value: example.grounded },
        policy_violation: { kind: "bool", value: example.policyViolation },
      },
    });
  }
  return { metrics: summarize(rows, { accuracy: binaryAccuracy(pairs) }, "grounded"), calls: rows };
}

async function evalEndToEnd(
  domainId: string,
  options: BenchOptions,
  runId: string,
  sampled: DatasetExample[],
  charge: (n: number) => void,
) {
  const limit = pLimit(getEnv().BENCH_CONCURRENCY);
  const rows: Array<{ query: string; answer: string; context: string; latency: number | null; grounded: boolean }> = [];
  const costSplit = { jev: 0, llmDecisions: 0, llmGeneration: 0, embeddings: 0 };
  let llmDecisionCalls = 0;
  let jevCalls = 0;
  let aborted = false;
  await Promise.all(sampled.map((example) => limit(async () => {
    if (aborted) return;
    const sink = createDbSink();
    const result = await runRequest({
      query: example.text,
      domainId,
      mode: options.mode,
      runId,
      sink,
    });
    let latency = 0;
    for (const decision of result.decisions) {
      addEngineCost(costSplit, decision.primary);
      if (decision.fallback) addEngineCost(costSplit, decision.fallback);
      if (decision.primary.engine === "jev") jevCalls += 1;
      if (decision.primary.engine === "llm") llmDecisionCalls += 1;
      if (decision.fallback?.engine === "llm") llmDecisionCalls += 1;
      if (!decision.primary.cacheHit) latency += decision.primary.latencyMs;
      if (decision.fallback && !decision.fallback.cacheHit) latency += decision.fallback.latencyMs;
    }
    for (const step of result.steps) {
      if (step.node === "generate" || step.node === "rewrite" || step.node === "clarify") costSplit.llmGeneration += step.costUsd;
      latency += step.latencyMs;
    }
    const grounded = result.decisions.find((decision) => decision.checkpoint === "verifier");
    const groundedAnswer = grounded?.fallback?.answers.grounded ?? grounded?.primary.answers.grounded;
    rows.push({
      query: example.text,
      answer: result.finalResponse,
      context: result.chunks.map((chunk) => chunk.text).join("\n").slice(0, 1000),
      latency,
      grounded: groundedAnswer?.type === "noul" ? groundedAnswer.probability > 0.5 : false,
    });
    try {
      charge(result.costUsd);
    } catch (error) {
      aborted = true;
      throw error;
    }
  })));
  return {
    rows,
    latencies: rows.map((row) => row.latency).filter((value): value is number => value !== null),
    verifierGrounded: rows.map((row) => row.grounded),
    costSplit,
    llmDecisionCalls,
    jevCalls,
  };
}

function addEngineCost(split: { jev: number; llmDecisions: number }, result: DecisionResult) {
  if (result.engine === "jev") split.jev += result.costUsd;
  else split.llmDecisions += result.costUsd;
}

function costOf(result?: DecisionResult): number {
  return result?.costUsd ?? 0;
}

type GoldLabel =
  | { kind: "bool"; value: boolean }
  | { kind: "choice"; value: string }
  | { kind: "score"; value: number };

interface MetricRow {
  correct: boolean;
  primary: DecisionResult;
  fallback?: DecisionResult;
  escalated: boolean;
  labels?: Record<string, GoldLabel>;
}

function rowFrom(decided: { trace: { primary: DecisionResult; fallback?: DecisionResult; escalated: boolean }; answers: Record<string, NormalizedAnswer> }, correct: boolean) {
  return {
    correct,
    primary: decided.trace.primary,
    fallback: decided.trace.fallback,
    escalated: decided.trace.escalated,
    answers: decided.answers,
  };
}

function matchesLabel(answer: NormalizedAnswer | undefined, label: GoldLabel): boolean {
  if (!answer) return false;
  if (label.kind === "bool") {
    const probability = answer.type === "noul" ? answer.probability : 0;
    return (probability >= 0.5) === label.value;
  }
  if (label.kind === "choice") return answer.type === "choice" && answer.choice === label.value;
  return answer.type === "score" && answer.bucket === label.value;
}

function summarize(
  rows: MetricRow[],
  extra: Partial<CheckpointMetrics>,
  question: string,
): CheckpointMetrics {
  const jevPoints: CalibrationPoint[] = [];
  const llmPoints: CalibrationPoint[] = [];
  const byQuestion = new Map<string, { jev: CalibrationPoint[]; llm: CalibrationPoint[] }>();
  const latencies: number[] = [];
  let escalated = 0;
  for (const row of rows) {
    if (row.escalated) escalated += 1;
    if (row.primary.engine === "jev") pushPoint(jevPoints, row.primary, question, row.correct);
    else pushPoint(llmPoints, row.primary, question, row.correct);
    if (!row.primary.cacheHit) latencies.push(row.primary.latencyMs);
    if (row.fallback) {
      if (row.fallback.engine === "jev") pushPoint(jevPoints, row.fallback, question, row.correct);
      else pushPoint(llmPoints, row.fallback, question, row.correct);
      if (!row.fallback.cacheHit) latencies.push(row.fallback.latencyMs);
    }
    for (const [name, label] of Object.entries(row.labels ?? {})) {
      const bucket = byQuestion.get(name) ?? { jev: [], llm: [] };
      collectQuestionPoint(bucket, row.primary, name, label);
      if (row.fallback) collectQuestionPoint(bucket, row.fallback, name, label);
      byQuestion.set(name, bucket);
    }
  }
  const questions = byQuestion.size === 0 ? undefined : Object.fromEntries(
    [...byQuestion.entries()].map(([name, bucket]) => [name, calibrate(bucket)]),
  );
  return {
    accuracy: extra.accuracy ?? 0,
    macroF1: extra.macroF1,
    precision: extra.precision,
    recall: extra.recall,
    f1: extra.f1,
    severityMae: extra.severityMae,
    severityExact: extra.severityExact,
    ece: {
      jev: jevPoints.length ? expectedCalibrationError(jevPoints) : undefined,
      llm: llmPoints.length ? expectedCalibrationError(llmPoints) : undefined,
    },
    brier: {
      jev: jevPoints.length ? brierScore(jevPoints) : undefined,
      llm: llmPoints.length ? brierScore(llmPoints) : undefined,
    },
    reliability: {
      jev: jevPoints.length ? reliabilityDiagram(jevPoints) : undefined,
      llm: llmPoints.length ? reliabilityDiagram(llmPoints) : undefined,
    },
    questions,
    escalationRate: rows.length === 0 ? 0 : escalated / rows.length,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
  };
}

function pushPoint(target: CalibrationPoint[], result: DecisionResult, question: string, correct: boolean) {
  target.push({ confidence: confidenceFor(result.answers[question]), correct });
}

function collectQuestionPoint(
  bucket: { jev: CalibrationPoint[]; llm: CalibrationPoint[] },
  result: DecisionResult,
  name: string,
  label: GoldLabel,
) {
  const answer = result.answers[name];
  if (!answer) return;
  const point = { confidence: confidenceFor(answer), correct: matchesLabel(answer, label) };
  if (result.engine === "jev") bucket.jev.push(point);
  else bucket.llm.push(point);
}

function calibrate(bucket: { jev: CalibrationPoint[]; llm: CalibrationPoint[] }) {
  return {
    ece: {
      jev: bucket.jev.length ? expectedCalibrationError(bucket.jev) : undefined,
      llm: bucket.llm.length ? expectedCalibrationError(bucket.llm) : undefined,
    },
    brier: {
      jev: bucket.jev.length ? brierScore(bucket.jev) : undefined,
      llm: bucket.llm.length ? brierScore(bucket.llm) : undefined,
    },
    reliability: {
      jev: bucket.jev.length ? reliabilityDiagram(bucket.jev) : undefined,
      llm: bucket.llm.length ? reliabilityDiagram(bucket.llm) : undefined,
    },
  };
}

function countEngine(
  groups: Array<{ calls: Array<{ primary: DecisionResult; fallback?: DecisionResult }> }>,
  engine: "jev" | "llm",
): number {
  let count = 0;
  for (const group of groups) {
    for (const call of group.calls) {
      if (call.primary.engine === engine) count += 1;
      if (call.fallback?.engine === engine) count += 1;
    }
  }
  return count;
}

function cacheRate(groups: Array<{ calls: Array<{ primary: DecisionResult; fallback?: DecisionResult }> }>): number {
  let hits = 0;
  let total = 0;
  for (const group of groups) {
    for (const call of group.calls) {
      total += 1;
      if (call.primary.cacheHit) hits += 1;
      if (call.fallback) {
        total += 1;
        if (call.fallback.cacheHit) hits += 1;
      }
    }
  }
  return total === 0 ? 0 : hits / total;
}

function loadAllThresholds(domainId: string): Record<CheckpointName, Record<string, number>> {
  const rows = getDb().select().from(thresholdTable).where(eq(thresholdTable.domainId, domainId)).all();
  const map: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    map[row.checkpoint] ??= {};
    map[row.checkpoint]![row.question] = row.value;
  }
  return {
    guardrail: map.guardrail ?? {},
    router: map.router ?? {},
    contextCheck: map.contextCheck ?? {},
    verifier: map.verifier ?? {},
  };
}

function withChunks(state: GraphState, chunks: { id: string; text: string }[]): GraphState {
  state.chunks = chunks.map((chunk) => ({ ...chunk, source: chunk.id, family: "bench", score: 1 }));
  return state;
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "unknown";
  } catch {
    return "unknown";
  }
}

function emptyMetrics(options: BenchOptions, requests: number): RunMetrics {
  return {
    domainId: options.domainId,
    mode: options.mode,
    split: options.split,
    sampleSize: requests,
    seed: options.seed,
    checkpoints: {},
    answerQuality: { mean: 0, low: 0, high: 0, n: 0 },
    judgeAgreement: 0,
    costPer1k: 0,
    costSplit: { jev: 0, llmDecisions: 0, llmGeneration: 0, embeddings: 0 },
    latencyP50: null,
    latencyP95: null,
    llmDecisionCalls: 0,
    jevCalls: 0,
    cacheHitRate: 0,
    requests,
  };
}

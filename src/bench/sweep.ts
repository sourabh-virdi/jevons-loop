import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getEnv } from "@/config/env";
import { SqliteModelCache } from "@/decision/cache";
import { DecisionEngine } from "@/decision/engine";
import { getDomain } from "@/domains/registry";
import type { DatasetExample } from "@/domains/types";
import { getDb } from "@/db/client";
import { sweeps, thresholds as thresholdTable } from "@/db/schema";
import { blankState } from "@/graph/blank";
import { sampleSeeded } from "@/lib/rng";
import { buildContextSet, buildGuardrailSet, buildVerifierSet } from "@/bench/labels";
import { chooseThreshold, costPerThousand, paretoFrontier, type ParetoPoint } from "@/bench/metrics";
import type { SweepPayload, SweepPoint } from "@/bench/types";
import type { CheckpointName, Mode, NormalizedAnswer, Split } from "@/types/contracts";

export async function runSweep(input: {
  domainId: string;
  checkpoint: CheckpointName;
  split: Split;
  n?: number;
  seed?: number;
  tolerance?: number;
}): Promise<SweepPayload> {
  const env = getEnv();
  const pack = getDomain(input.domainId);
  const n = input.n ?? 30;
  const seed = input.seed ?? 42;
  const tolerance = input.tolerance ?? env.SWEEP_TOLERANCE;
  const sampled = sampleSeeded(pack.dataset.load(input.split), n, seed);
  const checkpoint = pack.checkpoints[input.checkpoint];
  const baselineAccuracy = await accuracyAt(input.domainId, input.checkpoint, sampled, "baseline", {});
  const points: SweepPoint[] = [];
  for (const question of checkpoint.gatingQuestions) {
    for (let step = 0; step <= 9; step += 1) {
      const threshold = Number((0.5 + step * 0.05).toFixed(2));
      const overrides = { ...checkpoint.defaultThresholds, [question]: threshold };
      const scored = await scoreHybrid(input.domainId, input.checkpoint, sampled, overrides);
      points.push({
        question,
        threshold,
        accuracy: scored.accuracy,
        escalationRate: scored.escalationRate,
        costPer1k: scored.costPer1k,
      });
    }
  }
  const chosenByQuestion = new Map<string, SweepPoint>();
  for (const question of checkpoint.gatingQuestions) {
    const subset = points.filter((point) => point.question === question);
    const pareto = paretoFrontier(subset.map(asPareto)).map((point) => subset.find((item) => item.threshold === point.threshold && item.costPer1k === point.cost)!);
    const chosen = chooseThreshold(subset.map(asPareto), baselineAccuracy, tolerance);
    const match = chosen ? subset.find((point) => point.threshold === chosen.threshold && point.costPer1k === chosen.cost) : undefined;
    if (match) {
      chosenByQuestion.set(question, match);
      const id = `${input.domainId}:${input.checkpoint}:${question}`;
      getDb()
        .insert(thresholdTable)
        .values({
          id,
          domainId: input.domainId,
          checkpoint: input.checkpoint,
          question,
          value: match.threshold,
          updatedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: thresholdTable.id,
          set: { value: match.threshold, updatedAt: new Date().toISOString() },
        })
        .run();
    }
    void pareto;
  }
  const payload: SweepPayload = {
    domainId: input.domainId,
    checkpoint: input.checkpoint,
    split: input.split,
    baselineAccuracy,
    tolerance,
    points,
    pareto: paretoFrontier(points.map(asPareto)).flatMap((point) => {
      const match = points.find((item) => item.threshold === point.threshold && item.costPer1k === point.cost && item.accuracy === point.accuracy);
      return match ? [match] : [];
    }),
    chosen: [...chosenByQuestion.values()][0],
  };
  getDb().insert(sweeps).values({
    id: randomUUID(),
    domainId: input.domainId,
    checkpoint: input.checkpoint,
    split: input.split,
    payloadJson: JSON.stringify({ ...payload, chosenByQuestion: Object.fromEntries(chosenByQuestion) }),
    createdAt: new Date().toISOString(),
  }).run();
  return payload;
}

export function latestSweep(domainId: string, checkpoint?: string): SweepPayload | undefined {
  const rows = getDb().select().from(sweeps).where(eq(sweeps.domainId, domainId)).all();
  const filtered = rows.filter((row) => (checkpoint ? row.checkpoint === checkpoint : true));
  const latest = filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) return undefined;
  return JSON.parse(latest.payloadJson) as SweepPayload;
}

async function accuracyAt(
  domainId: string,
  checkpoint: CheckpointName,
  sampled: DatasetExample[],
  mode: Mode,
  overrides: Record<string, number>,
): Promise<number> {
  const scored = await scoreHybrid(domainId, checkpoint, sampled, overrides, mode);
  return scored.accuracy;
}

async function scoreHybrid(
  domainId: string,
  checkpoint: CheckpointName,
  sampled: DatasetExample[],
  overrides: Record<string, number>,
  mode: Mode = "hybrid",
) {
  const env = getEnv();
  const pack = getDomain(domainId);
  const engine = new DecisionEngine({
    jev: (await import("@/engines/jev/index")).createJevClient(),
    llm: (await import("@/engines/llm/client")).createLlmClient(),
    cache: new SqliteModelCache(),
    tokenBudget: env.JEV_STATE_TOKEN_BUDGET,
    cacheEnabled: env.CACHE_MODEL_CALLS,
  });
  const prepared = prepareExamples(domainId, checkpoint, sampled);
  let correct = 0;
  let escalated = 0;
  let cost = 0;
  for (const example of prepared) {
    const state = blankState({ requestId: example.id, domainId, mode, query: example.text });
    if (example.chunks) {
      state.chunks = example.chunks.map((chunk) => ({ ...chunk, source: chunk.id, family: "bench", score: 1 }));
    }
    if (example.draft) state.draft = example.draft;
    const decided = await engine.decide({
      requestId: state.requestId,
      domainId,
      mode,
      checkpoint,
      attempt: 0,
      state,
      config: pack.checkpoints[checkpoint],
      thresholdOverrides: overrides,
      jevModel: env.JEV_MODEL,
      llmModel: env.LLM_MODEL,
    });
    if (decided.trace.escalated) escalated += 1;
    cost += decided.trace.primary.costUsd + (decided.trace.fallback?.costUsd ?? 0);
    if (isCorrect(checkpoint, domainId, example, decided.answers, decided.outcome.edge)) correct += 1;
  }
  const total = prepared.length || 1;
  return {
    accuracy: correct / total,
    escalationRate: escalated / total,
    costPer1k: costPerThousand(cost, total),
  };
}

interface PreparedExample {
  id: string;
  text: string;
  gold: DatasetExample["gold"];
  goldBlock?: boolean;
  sufficient?: boolean;
  grounded?: boolean;
  draft?: string;
  chunks?: { id: string; text: string }[];
}

function prepareExamples(domainId: string, checkpoint: CheckpointName, sampled: DatasetExample[]): PreparedExample[] {
  if (checkpoint === "guardrail") {
    return buildGuardrailSet(domainId, sampled, 1).map((example) => ({
      id: example.id,
      text: example.text,
      gold: example.gold,
      goldBlock: example.goldBlock,
    }));
  }
  if (checkpoint === "contextCheck") {
    return buildContextSet(domainId, sampled).map((example) => ({
      id: example.id,
      text: example.text,
      gold: example.gold,
      chunks: example.chunks,
      sufficient: example.sufficient,
    }));
  }
  if (checkpoint === "verifier") {
    return buildVerifierSet(sampled).map((example) => ({
      id: example.id,
      text: example.text,
      gold: example.gold,
      draft: example.draft,
      chunks: [{ id: "ctx", text: example.context }],
      grounded: example.grounded,
    }));
  }
  return sampled.map((example) => ({ id: example.id, text: example.text, gold: example.gold }));
}

function isCorrect(
  checkpoint: CheckpointName,
  domainId: string,
  example: {
    gold: { intent?: string; component?: string; severity?: number };
    goldBlock?: boolean;
    sufficient?: boolean;
    grounded?: boolean;
  },
  answers: Record<string, NormalizedAnswer>,
  edge: string,
): boolean {
  if (checkpoint === "guardrail") return (edge === "blocked") === Boolean(example.goldBlock);
  if (checkpoint === "contextCheck") {
    const probability = answers.sufficient?.type === "noul" ? answers.sufficient.probability ?? 0 : 0;
    return (probability >= 0.5) === Boolean(example.sufficient);
  }
  if (checkpoint === "verifier") {
    const probability = answers.grounded?.type === "noul" ? answers.grounded.probability ?? 0 : 0;
    return (probability > 0.5) === Boolean(example.grounded);
  }
  if (domainId === "incident") {
    const component = answers.component?.type === "choice" ? answers.component.choice : "";
    const severity = answers.severity?.type === "score" ? answers.severity.bucket : -1;
    return component === example.gold.component && severity === example.gold.severity;
  }
  const intent = answers.intent?.type === "choice" ? answers.intent.choice : "";
  return intent === example.gold.intent;
}

function asPareto(point: SweepPoint): ParetoPoint {
  return {
    threshold: point.threshold,
    accuracy: point.accuracy,
    cost: point.costPer1k,
    escalationRate: point.escalationRate,
  };
}

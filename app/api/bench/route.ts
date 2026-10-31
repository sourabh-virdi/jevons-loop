import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { runBenchmark } from "@/bench/runner";
import { getDb } from "@/db/client";
import { runs } from "@/db/schema";
import type { RunMetrics } from "@/bench/types";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  domainId: z.enum(["support", "incident"]),
  mode: z.enum(["baseline", "hybrid", "jev-only"]),
  split: z.enum(["train", "validation", "test"]).default("test"),
  n: z.number().int().positive().max(5000).default(20),
  seed: z.number().int().default(42),
  maxCostUsd: z.number().positive().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");
  const mode = url.searchParams.get("mode");
  const rows = getDb().select().from(runs).orderBy(desc(runs.createdAt)).all();
  const filtered = rows.filter((row) => (domain ? row.domainId === domain : true) && (mode ? row.mode === mode : true));
  return Response.json({
    runs: filtered.map((row) => ({
      id: row.id,
      domainId: row.domainId,
      mode: row.mode,
      split: row.split,
      sampleSize: row.sampleSize,
      seed: row.seed,
      status: row.status,
      costUsd: row.costUsd,
      createdAt: row.createdAt,
      headline: headline(row.metricsJson),
    })),
  });
}

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid benchmark request" }, { status: 400 });
  const result = await runBenchmark(parsed.data);
  return Response.json(result);
}

function headline(metricsJson: string | null) {
  if (!metricsJson) return null;
  const metrics = JSON.parse(metricsJson) as RunMetrics;
  return {
    costPer1k: metrics.costPer1k,
    accuracy: metrics.checkpoints.router?.accuracy ?? null,
    quality: metrics.answerQuality.mean,
  };
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import type { RunMetrics } from "@/bench/types";
import { getDb } from "@/db/client";
import { runs } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function BenchmarkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = getDb().select().from(runs).where(eq(runs.id, id)).get();
  if (!row) notFound();
  const metrics = row.metricsJson ? (JSON.parse(row.metricsJson) as RunMetrics) : null;
  return (
    <div className="space-y-4">
      <Link href="/benchmarks" className="text-sm underline">All runs</Link>
      <h1 className="text-2xl font-semibold">{row.domainId} · {row.mode}</h1>
      <p className="text-sm text-stone-600">{row.status} · n={row.sampleSize} · seed {row.seed} · {row.gitSha}</p>
      {metrics ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Stat label="Cost / 1k" value={metrics.costPer1k.toFixed(4)} />
          <Stat label="p50 / p95" value={`${metrics.latencyP50 ?? "n/a"} / ${metrics.latencyP95 ?? "n/a"}`} />
          <Stat label="Quality" value={`${metrics.answerQuality.mean.toFixed(2)} (${metrics.answerQuality.low.toFixed(2)}–${metrics.answerQuality.high.toFixed(2)})`} />
          {Object.entries(metrics.checkpoints).map(([name, checkpoint]) => (
            <Stat key={name} label={name} value={`acc ${((checkpoint?.accuracy ?? 0) * 100).toFixed(1)}% · ECE ${checkpoint?.ece.jev ?? checkpoint?.ece.llm ?? "n/a"}`} />
          ))}
        </div>
      ) : <p>This run has no metrics yet.</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-lg border border-stone-300 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-lg">{value}</p>
    </section>
  );
}

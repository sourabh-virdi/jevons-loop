import { llmCallsAvoided } from "@/bench/metrics";
import type { RunMetrics } from "@/bench/types";

export interface ComparedRun {
  id: string;
  metrics: RunMetrics;
}

export function comparisonMarkdown(runs: ComparedRun[]): string {
  const lines = ["# Benchmark comparison", ""];
  lines.push("| Run | Domain | Mode | Cost / 1k USD | p50 ms | p95 ms | Router acc | ECE | Quality | CI |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const run of runs) {
    const router = run.metrics.checkpoints.router;
    const ece = router?.ece.jev ?? router?.ece.llm;
    lines.push(
      `| ${run.id.slice(0, 8)} | ${run.metrics.domainId} | ${run.metrics.mode} | ${run.metrics.costPer1k.toFixed(4)} | ${fmt(run.metrics.latencyP50)} | ${fmt(run.metrics.latencyP95)} | ${pct(router?.accuracy)} | ${fmt(ece)} | ${run.metrics.answerQuality.mean.toFixed(2)} | ${run.metrics.answerQuality.low.toFixed(2)}–${run.metrics.answerQuality.high.toFixed(2)} |`,
    );
  }
  const hybrid = runs.find((run) => run.metrics.mode === "hybrid");
  const baseline = runs.find((run) => run.metrics.mode === "baseline");
  if (hybrid && baseline) {
    lines.push("");
    lines.push(`LLM calls avoided: ${(llmCallsAvoided(hybrid.metrics.llmDecisionCalls, baseline.metrics.llmDecisionCalls) * 100).toFixed(1)}%`);
    lines.push(`Cost delta (hybrid - baseline) / 1k: ${(hybrid.metrics.costPer1k - baseline.metrics.costPer1k).toFixed(4)}`);
  }
  lines.push("");
  lines.push("## Per checkpoint");
  for (const run of runs) {
    lines.push(`### ${run.metrics.mode} ${run.id.slice(0, 8)}`);
    for (const [name, metrics] of Object.entries(run.metrics.checkpoints)) {
      if (!metrics) continue;
      lines.push(`- ${name}: accuracy ${pct(metrics.accuracy)}, escalation ${(metrics.escalationRate * 100).toFixed(1)}%, p50 ${fmt(metrics.latencyP50)} ms, p95 ${fmt(metrics.latencyP95)} ms, ECE jev ${fmt(metrics.ece.jev)} llm ${fmt(metrics.ece.llm)}`);
    }
  }
  return lines.join("\n");
}

function pct(value: number | undefined): string {
  return value === undefined ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined ? "n/a" : value.toFixed(2);
}

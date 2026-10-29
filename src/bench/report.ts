import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { comparisonMarkdown, type ComparedRun } from "@/bench/compare";
import type { RunMetrics } from "@/bench/types";
import { getDb } from "@/db/client";
import { runs } from "@/db/schema";

export function loadRuns(ids?: string[]): ComparedRun[] {
  const rows = getDb().select().from(runs).all();
  const selected = ids && ids.length > 0 ? rows.filter((row) => ids.includes(row.id)) : rows.filter((row) => row.status === "completed" && row.metricsJson);
  return selected.flatMap((row) => {
    if (!row.metricsJson) return [];
    return [{ id: row.id, metrics: JSON.parse(row.metricsJson) as RunMetrics }];
  });
}

export function writeReports(ids?: string[]): { markdown: string; html: string } {
  const compared = loadRuns(ids);
  const markdown = comparisonMarkdown(compared);
  const html = renderHtml(markdown, compared);
  const dir = resolve("reports");
  mkdirSync(dir, { recursive: true });
  const markdownPath = resolve(dir, "benchmark-report.md");
  const htmlPath = resolve(dir, "benchmark-report.html");
  writeFileSync(markdownPath, markdown);
  writeFileSync(htmlPath, html);
  return { markdown: markdownPath, html: htmlPath };
}

function renderHtml(markdown: string, runsCompared: ComparedRun[]): string {
  const rows = runsCompared
    .map((run) => {
      const router = run.metrics.checkpoints.router;
      return `<tr><td>${escapeHtml(run.id)}</td><td>${run.metrics.domainId}</td><td>${run.metrics.mode}</td><td>${run.metrics.costPer1k.toFixed(4)}</td><td>${run.metrics.latencyP50 ?? "n/a"}</td><td>${run.metrics.latencyP95 ?? "n/a"}</td><td>${router ? (router.accuracy * 100).toFixed(1) : "n/a"}%</td><td>${run.metrics.answerQuality.mean.toFixed(2)} (${run.metrics.answerQuality.low.toFixed(2)}–${run.metrics.answerQuality.high.toFixed(2)})</td></tr>`;
    })
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Hybrid decision layer benchmark report</title>
  <style>
    body { font-family: Georgia, serif; margin: 2rem auto; max-width: 960px; color: #1c1917; background: #f4f1ea; }
    table { border-collapse: collapse; width: 100%; background: white; }
    th, td { border: 1px solid #d6d0c4; padding: 0.4rem 0.6rem; text-align: left; }
    pre { white-space: pre-wrap; background: white; padding: 1rem; }
  </style>
</head>
<body>
  <h1>Hybrid decision layer</h1>
  <p>Baseline, hybrid, and jev-only runs. Latency excludes cached calls. Cost uses reported usage, not a token estimate.</p>
  <table>
    <thead><tr><th>Run</th><th>Domain</th><th>Mode</th><th>Cost / 1k</th><th>p50</th><th>p95</th><th>Router accuracy</th><th>Quality (95% CI)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h2>Markdown</h2>
  <pre>${escapeHtml(markdown)}</pre>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function getRun(id: string): ComparedRun | undefined {
  const row = getDb().select().from(runs).where(eq(runs.id, id)).get();
  if (!row?.metricsJson) return undefined;
  return { id: row.id, metrics: JSON.parse(row.metricsJson) as RunMetrics };
}

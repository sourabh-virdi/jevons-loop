"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { comparisonMarkdown } from "@/bench/compare";
import { llmCallsAvoided } from "@/bench/metrics";
import type { RunMetrics } from "@/bench/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";

interface RunRow {
  id: string;
  domainId: string;
  mode: string;
  split: string;
  sampleSize: number;
  seed: number;
  status: string;
  costUsd: number;
  createdAt: string;
  headline: { costPer1k: number; accuracy: number | null; quality: number } | null;
}

export function BenchmarksView() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [domain, setDomain] = useState("");
  const [mode, setMode] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<Array<{ id: string; metrics: RunMetrics }>>([]);
  const [form, setForm] = useState({ domainId: "support", mode: "hybrid", split: "test", n: 8, seed: 42 });
  const [busy, setBusy] = useState(false);

  async function load() {
    const params = new URLSearchParams();
    if (domain) params.set("domain", domain);
    if (mode) params.set("mode", mode);
    const response = await fetch(`/api/bench?${params.toString()}`);
    const body = (await response.json()) as { runs: RunRow[] };
    setRuns(body.runs);
  }

  useEffect(() => {
    void load();
  }, [domain, mode]);

  async function start() {
    setBusy(true);
    await fetch("/api/bench", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    await load();
  }

  async function compare() {
    const loaded = await Promise.all(
      selected.slice(0, 3).map(async (id) => {
        const response = await fetch(`/api/bench/${id}`);
        const body = (await response.json()) as { id: string; metrics: RunMetrics };
        return { id: body.id, metrics: body.metrics };
      }),
    );
    setDetails(loaded.filter((item) => item.metrics));
  }

  function exportMarkdown() {
    const markdown = comparisonMarkdown(details);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "benchmark-comparison.md";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Start a run</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Select value={form.domainId} onChange={(event) => setForm({ ...form, domainId: event.target.value })}>
            <option value="support">support</option>
            <option value="incident">incident</option>
          </Select>
          <Select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value })}>
            <option value="hybrid">hybrid</option>
            <option value="baseline">baseline</option>
            <option value="jev-only">jev-only</option>
          </Select>
          <Select value={form.split} onChange={(event) => setForm({ ...form, split: event.target.value })}>
            <option value="test">test</option>
            <option value="validation">validation</option>
            <option value="train">train</option>
          </Select>
          <Button type="button" onClick={() => void start()} disabled={busy}>{busy ? "Running" : "Run"}</Button>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Select value={domain} onChange={(event) => setDomain(event.target.value)}>
          <option value="">All domains</option>
          <option value="support">support</option>
          <option value="incident">incident</option>
        </Select>
        <Select value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="">All modes</option>
          <option value="hybrid">hybrid</option>
          <option value="baseline">baseline</option>
          <option value="jev-only">jev-only</option>
        </Select>
        <Button type="button" variant="outline" onClick={() => void compare()} disabled={selected.length < 2}>Compare</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-stone-300 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-100">
            <tr>
              <th className="p-2" />
              <th className="p-2">Run</th>
              <th className="p-2">Domain</th>
              <th className="p-2">Mode</th>
              <th className="p-2">Status</th>
              <th className="p-2">Cost / 1k</th>
              <th className="p-2">Router acc</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-t border-stone-200">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(run.id)}
                    onChange={(event) => {
                      setSelected((current) => {
                        if (!event.target.checked) return current.filter((id) => id !== run.id);
                        return current.length >= 3 ? current : [...current, run.id];
                      });
                    }}
                  />
                </td>
                <td className="p-2"><Link className="underline" href={`/benchmarks/${run.id}`}>{run.id.slice(0, 8)}</Link></td>
                <td className="p-2">{run.domainId}</td>
                <td className="p-2">{run.mode}</td>
                <td className="p-2">{run.status}</td>
                <td className="p-2">{run.headline ? run.headline.costPer1k.toFixed(4) : "—"}</td>
                <td className="p-2">{run.headline?.accuracy === null || run.headline?.accuracy === undefined ? "—" : `${(run.headline.accuracy * 100).toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {details.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">Side by side <Button type="button" variant="outline" onClick={exportMarkdown}>Export Markdown</Button></CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Metric</th>
                  {details.map((run) => <th key={run.id} className="p-2">{run.metrics.mode}</th>)}
                </tr>
              </thead>
              <tbody>
                <MetricRow label="Cost / 1k" values={details.map((run) => run.metrics.costPer1k.toFixed(4))} />
                <MetricRow label="p50 ms" values={details.map((run) => String(run.metrics.latencyP50 ?? "n/a"))} />
                <MetricRow label="p95 ms" values={details.map((run) => String(run.metrics.latencyP95 ?? "n/a"))} />
                <MetricRow label="Router accuracy" values={details.map((run) => pct(run.metrics.checkpoints.router?.accuracy))} />
                <MetricRow label="Guardrail F1" values={details.map((run) => pct(run.metrics.checkpoints.guardrail?.f1))} />
                <MetricRow label="Context accuracy" values={details.map((run) => pct(run.metrics.checkpoints.contextCheck?.accuracy))} />
                <MetricRow label="Verifier accuracy" values={details.map((run) => pct(run.metrics.checkpoints.verifier?.accuracy))} />
                <MetricRow label="ECE" values={details.map((run) => fmt(run.metrics.checkpoints.router?.ece.jev ?? run.metrics.checkpoints.router?.ece.llm))} />
                <MetricRow label="Quality" values={details.map((run) => `${run.metrics.answerQuality.mean.toFixed(2)} (${run.metrics.answerQuality.low.toFixed(2)}–${run.metrics.answerQuality.high.toFixed(2)})`)} />
                <MetricRow label="LLM decision calls" values={details.map((run) => String(run.metrics.llmDecisionCalls))} />
                <MetricRow label="LLM calls avoided" values={details.map((run) => avoidedLabel(run, details))} />
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function MetricRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr className="border-t border-stone-200">
      <td className="p-2">{label}</td>
      {values.map((value, index) => <td key={`${label}-${index}`} className="p-2">{value}</td>)}
    </tr>
  );
}

function avoidedLabel(
  run: { metrics: RunMetrics },
  details: Array<{ metrics: RunMetrics }>,
): string {
  if (run.metrics.mode !== "hybrid") return "n/a";
  const baseline = details.find((item) => item.metrics.mode === "baseline" && item.metrics.domainId === run.metrics.domainId);
  if (!baseline) return "n/a";
  return `${(llmCallsAvoided(run.metrics.llmDecisionCalls, baseline.metrics.llmDecisionCalls) * 100).toFixed(1)}%`;
}

function pct(value: number | undefined): string {
  return value === undefined ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function fmt(value: number | undefined): string {
  return value === undefined ? "n/a" : value.toFixed(3);
}

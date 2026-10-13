"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RunMetrics } from "@/bench/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";

interface RunRow { id: string; mode: string; domainId: string; status: string }

export function CalibrationView() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [runId, setRunId] = useState("");
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);
  const [checkpoint, setCheckpoint] = useState("router");
  const [question, setQuestion] = useState("");

  useEffect(() => {
    void fetch("/api/bench").then(async (response) => {
      const body = (await response.json()) as { runs: RunRow[] };
      setRuns(body.runs.filter((run) => run.status === "completed"));
    });
  }, []);

  useEffect(() => {
    if (!runId) return;
    void fetch(`/api/bench/${runId}`).then(async (response) => {
      const body = (await response.json()) as { metrics: RunMetrics };
      setMetrics(body.metrics);
    });
  }, [runId]);

  const selected = metrics?.checkpoints[checkpoint as keyof RunMetrics["checkpoints"]];
  const questionNames = Object.keys(selected?.questions ?? {});
  const questionMetrics = question ? selected?.questions?.[question] : undefined;
  const shown = questionMetrics ?? selected;
  const jev = shown?.reliability.jev ?? [];
  const llm = shown?.reliability.llm ?? [];
  const data = jev.map((bin, index) => ({
    confidence: Number(bin.confidence.toFixed(2)),
    jev: bin.count ? bin.accuracy : null,
    llm: llm[index]?.count ? llm[index]?.accuracy : null,
    ideal: bin.upper,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={runId} onChange={(event) => setRunId(event.target.value)}>
          <option value="">Select a run</option>
          {runs.map((run) => <option key={run.id} value={run.id}>{run.domainId} {run.mode} {run.id.slice(0, 8)}</option>)}
        </Select>
        <Select value={checkpoint} onChange={(event) => { setCheckpoint(event.target.value); setQuestion(""); }}>
          <option value="guardrail">guardrail</option>
          <option value="router">router</option>
          <option value="contextCheck">context check</option>
          <option value="verifier">verifier</option>
        </Select>
        <Select value={question} onChange={(event) => setQuestion(event.target.value)}>
          <option value="">checkpoint</option>
          {questionNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </div>
      {!metrics ? <p className="text-sm text-stone-600">Run a benchmark, then pick it here. The diagram overlays Jev and LLM when both engines answered.</p> : null}
      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle>
              ECE Jev {fmt(shown?.ece.jev)} · LLM {fmt(shown?.ece.llm)} · Brier Jev {fmt(shown?.brier.jev)} · LLM {fmt(shown?.brier.llm)}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid stroke="#e7e1d6" />
                <XAxis dataKey="confidence" />
                <YAxis domain={[0, 1]} />
                <Tooltip />
                <Legend />
                <Line dataKey="ideal" name="ideal" stroke="#a8a29e" dot={false} />
                <Line dataKey="jev" name="Jev" stroke="#0f5f5c" connectNulls />
                <Line dataKey="llm" name="LLM" stroke="#9a3412" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function fmt(value: number | undefined): string {
  return value === undefined ? "n/a" : value.toFixed(3);
}

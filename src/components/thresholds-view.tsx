"use client";

import { useEffect, useMemo, useState } from "react";
import { Scatter, ScatterChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import type { SweepPayload } from "@/bench/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

interface Payload {
  checkpoints: Record<string, { gatingQuestions: string[]; thresholds: Record<string, number> }>;
  sweeps: Record<string, SweepPayload | null>;
}

export function ThresholdsView() {
  const [domainId, setDomainId] = useState("support");
  const [checkpoint, setCheckpoint] = useState("router");
  const [data, setData] = useState<Payload | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState("");

  useEffect(() => {
    void fetch(`/api/thresholds?domain=${domainId}`).then(async (response) => {
      const body = (await response.json()) as Payload;
      setData(body);
      setValues(body.checkpoints[checkpoint]?.thresholds ?? {});
    });
  }, [domainId, checkpoint]);

  const sweep = data?.sweeps[checkpoint] ?? null;
  const live = useMemo(() => {
    if (!sweep) return [];
    return Object.entries(values).map(([question, threshold]) => {
      const nearest = sweep.points
        .filter((point) => point.question === question)
        .sort((a, b) => Math.abs(a.threshold - threshold) - Math.abs(b.threshold - threshold))[0];
      return nearest ? { ...nearest, threshold } : null;
    }).filter((item): item is NonNullable<typeof item> => item !== null);
  }, [sweep, values]);

  async function save() {
    await fetch("/api/thresholds", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domainId, values: { [checkpoint]: values } }),
    });
    setSaved("Saved. The next hybrid run uses these thresholds.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={domainId} onChange={(event) => setDomainId(event.target.value)}>
          <option value="support">support</option>
          <option value="incident">incident</option>
        </Select>
        <Select value={checkpoint} onChange={(event) => setCheckpoint(event.target.value)}>
          <option value="guardrail">guardrail</option>
          <option value="router">router</option>
          <option value="contextCheck">context check</option>
          <option value="verifier">verifier</option>
        </Select>
      </div>
      {!sweep ? <p className="text-sm text-stone-600">No sweep is stored yet. Run `pnpm bench:sweep -- --domain {domainId} --checkpoint {checkpoint} --split validation`.</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(values).map(([question, value]) => {
          const point = live.find((item) => item.question === question);
          return (
            <Card key={question}>
              <CardHeader><CardTitle>{question}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Slider min={0.5} max={0.95} step={0.05} value={[value]} onValueChange={(next) => setValues((current) => ({ ...current, [question]: next[0] ?? value }))} />
                <p className="text-sm">Threshold {value.toFixed(2)}</p>
                {point ? <p className="text-sm text-stone-600">Accuracy {(point.accuracy * 100).toFixed(1)}% · escalation {(point.escalationRate * 100).toFixed(1)}% · cost/1k {point.costPer1k.toFixed(4)}</p> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {sweep ? (
        <Card>
          <CardHeader><CardTitle>Pareto · cost versus accuracy</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid stroke="#e7e1d6" />
                <XAxis dataKey="costPer1k" name="cost" />
                <YAxis dataKey="accuracy" name="accuracy" domain={[0, 1]} />
                <Tooltip />
                <Scatter data={sweep.points} fill="#a8a29e" />
                <Scatter data={sweep.pareto} fill="#0f5f5c" />
                {sweep.chosen ? <Scatter data={[sweep.chosen]} fill="#9a3412" /> : null}
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}
      <Button type="button" onClick={() => void save()}>Save thresholds</Button>
      {saved ? <p className="text-sm text-teal-800">{saved}</p> : null}
    </div>
  );
}

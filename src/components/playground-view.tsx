"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Select, Textarea } from "@/components/ui/input";
import type { DecisionTrace, FinalPayload, Mode, StepTrace } from "@/types/contracts";

interface DomainOption {
  id: string;
  displayName: string;
  description: string;
  samplePrompts: string[];
}

const nodes = ["guardrail", "router", "tool", "retrieve", "contextCheck", "rewrite", "generate", "verify", "finalize"];

export function PlaygroundView({ domains, defaultDomain }: { domains: DomainOption[]; defaultDomain: string }) {
  const [domainId, setDomainId] = useState(domains.some((domain) => domain.id === defaultDomain) ? defaultDomain : domains[0]?.id ?? "support");
  const [mode, setMode] = useState<Mode>("hybrid");
  const [query, setQuery] = useState(domains.find((domain) => domain.id === domainId)?.samplePrompts[0] ?? "");
  const [active, setActive] = useState("");
  const [visited, setVisited] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<DecisionTrace[]>([]);
  const [steps, setSteps] = useState<StepTrace[]>([]);
  const [draft, setDraft] = useState("");
  const [finalPayload, setFinalPayload] = useState<FinalPayload | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const domain = domains.find((item) => item.id === domainId) ?? domains[0];

  const totals = useMemo(() => {
    const decisionCost = decisions.reduce((sum, decision) => sum + decision.primary.costUsd + (decision.fallback?.costUsd ?? 0), 0);
    const stepCost = steps.reduce((sum, step) => sum + step.costUsd, 0);
    return {
      cost: finalPayload?.costUsd ?? decisionCost + stepCost,
      latency: finalPayload?.latencyMs ?? decisions.reduce((sum, decision) => sum + decision.primary.latencyMs, 0),
    };
  }, [decisions, steps, finalPayload]);

  async function run() {
    setRunning(true);
    setError("");
    setDecisions([]);
    setSteps([]);
    setDraft("");
    setFinalPayload(null);
    setVisited([]);
    setActive("guardrail");
    try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, domainId, mode }),
    });
    if (!response.ok || !response.body) {
      setError("The run request failed.");
      setRunning(false);
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const event = part.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
        const dataLine = part.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
        if (!event || !dataLine) continue;
        const data = JSON.parse(dataLine) as Record<string, unknown>;
        if (event === "decision") {
          const decision = data as unknown as DecisionTrace;
          setDecisions((current) => [...current, decision]);
          setVisited((current) => [...current, decision.checkpoint]);
          setActive(decision.checkpoint);
        } else if (event === "step") {
          const step = data as unknown as StepTrace;
          setSteps((current) => [...current, step]);
          setVisited((current) => [...current, step.node]);
          setActive(step.node);
        } else if (event === "token") {
          setActive("generate");
          setDraft((current) => current + String(data.text ?? ""));
        } else if (event === "final") {
          setFinalPayload(data as unknown as FinalPayload);
          setVisited((current) => [...current, "finalize"]);
          setActive("");
        } else if (event === "error") {
          setError(String(data.message ?? "Run failed"));
        }
      }
    }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader><CardTitle>Request</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Label>Domain</Label>
          <Select value={domainId} onChange={(event) => {
            const next = event.target.value;
            setDomainId(next);
            const prompt = domains.find((item) => item.id === next)?.samplePrompts[0] ?? "";
            setQuery(prompt);
          }}>
            {domains.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
          </Select>
          <Label>Mode</Label>
          <Select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
            <option value="hybrid">hybrid</option>
            <option value="baseline">baseline</option>
            <option value="jev-only">jev-only</option>
          </Select>
          <Label>Samples</Label>
          <div className="flex flex-col gap-2">
            {domain?.samplePrompts.map((prompt) => (
              <button key={prompt} type="button" className="rounded border border-stone-200 px-2 py-1 text-left text-xs hover:bg-stone-50" onClick={() => setQuery(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
          <Textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={5} />
          <Button type="button" onClick={() => void run()} disabled={running || query.trim().length === 0}>
            {running ? "Running" : "Run"}
          </Button>
          <p className="text-xs text-stone-600">Cost {totals.cost.toFixed(6)} USD · latency {Math.round(totals.latency)} ms</p>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Graph</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {nodes.map((node) => (
              <span
                key={node}
                data-testid={`node-${node}`}
                className={`rounded-full border px-2 py-1 text-xs ${active === node ? "border-teal-800 bg-teal-800 text-white" : visited.includes(node) ? "border-teal-700 bg-teal-50" : "border-stone-300 text-stone-500"}`}
              >
                {node}
              </span>
            ))}
          </CardContent>
        </Card>
        {decisions.map((decision, index) => (
          <Card key={`${decision.checkpoint}-${index}`} data-testid={`checkpoint-${decision.checkpoint}`}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {decision.checkpoint}
                <Badge>{decision.fallback?.engine ?? decision.primary.engine}</Badge>
                <Badge>{decision.escalated ? "escalated" : "held"}</Badge>
                <span className="text-xs font-normal text-stone-500">{decision.primary.latencyMs} ms · ${decision.primary.costUsd.toFixed(6)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Outcome: {decision.outcome}{decision.escalationReason ? ` · ${decision.escalationReason}` : ""}</p>
              {Object.entries(decision.primary.answers).map(([question, answer]) => {
                const threshold = decision.thresholds[question];
                const confidence = answer.confidence;
                const probabilities = answer.type === "noul"
                  ? { yes: answer.probability, no: 1 - answer.probability }
                  : answer.probabilities ?? {};
                return (
                  <div key={question}>
                    <div className="flex justify-between gap-3 text-xs">
                      <span>{question}: {answer.type === "choice" ? answer.choice : answer.type === "score" ? `bucket ${answer.bucket}` : answer.probability.toFixed(2)}</span>
                      <span>confidence {confidence.toFixed(2)}{threshold !== undefined ? ` / threshold ${threshold.toFixed(2)}` : ""}</span>
                    </div>
                    <div className="mt-1 space-y-1">
                      {Object.entries(probabilities).slice(0, 4).map(([label, value]) => (
                        <div key={label} className="flex items-center gap-2 text-xs">
                          <span className="w-24 truncate">{label}</span>
                          <span className="h-2 flex-1 rounded bg-stone-200">
                            <span className="block h-2 rounded bg-teal-700" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader><CardTitle>Response</CardTitle></CardHeader>
          <CardContent>
            <p data-testid="final-response" className="whitespace-pre-wrap text-sm">{finalPayload?.finalResponse || draft || "Run a request to stream the trace."}</p>
            {error ? <p className="mt-2 text-sm text-red-800">{error}</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

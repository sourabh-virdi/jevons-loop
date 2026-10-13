"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

interface DecisionRow {
  id: string;
  domainId: string;
  mode: string;
  checkpoint: string;
  outcome: string;
  escalated: boolean;
  disagreement: boolean;
  escalationReason: string | null;
  statePreview: string | null;
  timestamp: string;
  primary: { engine: string; answers: Record<string, { type: string; choice?: string; probability?: number; bucket?: number }> };
  fallback: { engine: string; answers: Record<string, { type: string; choice?: string; probability?: number; bucket?: number }> } | null;
}

export function DecisionsView() {
  const [domain, setDomain] = useState("");
  const [checkpoint, setCheckpoint] = useState("");
  const [escalated, setEscalated] = useState("");
  const [disagreement, setDisagreement] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<DecisionRow[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (domain) params.set("domain", domain);
    if (checkpoint) params.set("checkpoint", checkpoint);
    if (escalated) params.set("escalated", escalated);
    if (disagreement) params.set("disagreement", "true");
    void fetch(`/api/decisions?${params.toString()}`).then(async (response) => {
      const body = (await response.json()) as { decisions: DecisionRow[]; total: number };
      setRows(body.decisions);
      setTotal(body.total);
    });
  }, [domain, checkpoint, escalated, disagreement, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={domain} onChange={(event) => { setPage(1); setDomain(event.target.value); }}>
          <option value="">All domains</option>
          <option value="support">support</option>
          <option value="incident">incident</option>
        </Select>
        <Select value={checkpoint} onChange={(event) => { setPage(1); setCheckpoint(event.target.value); }}>
          <option value="">All checkpoints</option>
          <option value="guardrail">guardrail</option>
          <option value="router">router</option>
          <option value="contextCheck">context check</option>
          <option value="verifier">verifier</option>
        </Select>
        <Select value={escalated} onChange={(event) => { setPage(1); setEscalated(event.target.value); }}>
          <option value="">Escalation: any</option>
          <option value="true">escalated</option>
          <option value="false">held</option>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={disagreement} onChange={(event) => { setPage(1); setDisagreement(event.target.checked); }} />
          Disagreements only
        </label>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <article key={row.id} className="rounded-lg border border-stone-300 bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{row.checkpoint}</strong>
              <Badge>{row.domainId}</Badge>
              <Badge>{row.mode}</Badge>
              <Badge>{row.escalated ? "escalated" : "held"}</Badge>
              {row.disagreement ? <Badge>disagreement</Badge> : null}
              <span className="text-stone-500">{row.outcome}</span>
            </div>
            {row.escalationReason ? <p className="mt-1 text-stone-600">{row.escalationReason}</p> : null}
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <pre className="overflow-auto rounded bg-stone-50 p-2 text-xs">{JSON.stringify(row.primary.answers, null, 2)}</pre>
              {row.fallback ? <pre className="overflow-auto rounded bg-stone-50 p-2 text-xs">{JSON.stringify(row.fallback.answers, null, 2)}</pre> : null}
            </div>
            {disagreement && row.statePreview ? <p className="mt-2 text-xs text-stone-600">{row.statePreview}</p> : null}
          </article>
        ))}
        {rows.length === 0 ? <p className="text-sm text-stone-600">No decisions match these filters.</p> : null}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <Button type="button" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
        <span>Page {page} · {total} decisions</span>
        <Button type="button" variant="outline" onClick={() => setPage((current) => current + 1)} disabled={page * 20 >= total}>Next</Button>
      </div>
    </div>
  );
}

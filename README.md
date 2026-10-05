# Hybrid Decision Layer

A configurable agent runtime that splits work between Jev (fast typed decisions) and an LLM (open-ended writing and low-confidence fallback). One engine runs two domain packs:

- `support` — banking customer support over Banking77, synthetic FAQs, and mock account tools
- `incident` — IT incident triage over LogHub-style windows, synthetic runbooks, and mock ops tools

The same inputs can run in `baseline` (LLM at every checkpoint), `hybrid` (Jev, then LLM when confidence is low), or `jev-only` (no fallback).

Guides, diagrams, and a blog post are in [docs/README.md](docs/README.md).

## Architecture

```text
Request -> CP1 Guardrail -> CP2 Router -> tool? -> retrieve
        -> CP3 Context check -> rewrite? -> CP4 Verifier -> response
```

Each diamond is the Decision Engine:

1. Build a Jev state inside `JEV_STATE_TOKEN_BUDGET` (default 8,000 tokens).
2. Call Jev or the LLM, depending on the mode.
3. Parse the response with Zod and normalise it.
4. Compare gating-question confidence with the checkpoint thresholds.
5. In hybrid mode, call the LLM when confidence is low or Jev errors (`escalationReason: jev_error`).
6. Run the domain policy to pick the next graph edge.
7. Store a decision trace (engine, state hash, answers, confidence, latency, cost).

Domain behaviour lives in `src/domains/<id>/`. Adding a domain is a new folder plus one registry entry. Jev and LLM calls stay in `src/engines`.

OpenRouter documents a 32,000-token context for `typesafe/jev-1.13`. The checkpoint budget stays at 8,000 so the state sent to Jev remains well inside that window. The spec's earlier 64k note is superseded by the model page.

## Demo

Requirements: Node.js 22+ and pnpm.

```bash
pnpm install
pnpm fetch-data
pnpm ingest
pnpm dev
```

The committed `.env` uses `JEV_TRANSPORT=mock`, so the app, tests, and benchmarks run with no API key and no network. To call Jev and a real chat model, put a key in `.env.local` and set:

```bash
OPENROUTER_API_KEY=...
JEV_TRANSPORT=rest          # or ai-sdk
LLM_MODEL=openai/gpt-4o-mini
```

Then:

1. Open [http://localhost:3000](http://localhost:3000) and pick a domain.
2. In the playground, run a sample prompt in `hybrid` mode. The graph highlights the active node. Each checkpoint shows the engine, probabilities, confidence, threshold, escalation, latency, and cost.
3. Run the same seed in all three modes:

```bash
pnpm bench -- --domain support --mode hybrid --split test --n 20 --seed 42
pnpm bench -- --domain support --mode baseline --split test --n 20 --seed 42
pnpm bench -- --domain support --mode jev-only --split test --n 20 --seed 42
pnpm bench:compare <runIdA> <runIdB>
```

4. Tune thresholds on the validation split. The chosen values are stored and the next hybrid run uses them.

```bash
pnpm bench:sweep -- --domain support --checkpoint router --split validation
```

5. Write the report:

```bash
pnpm report
```

`reports/benchmark-report.md` and `reports/benchmark-report.html` are self-contained.

`pnpm bench --domain ...` (without a second `--`) is accepted by pnpm when the flag is forwarded. If your pnpm treats it as its own flag, use the `--` form above.

## Checks

```bash
pnpm test          # Vitest, mock transport, no network
pnpm test:e2e      # Playwright smoke of the playground
pnpm typecheck
```

## Benchmark metrics

Per checkpoint: accuracy, macro-F1, severity MAE and exact match, guardrail precision/recall/F1, ECE (10 bins), Brier, escalation rate, and p50/p95 latency from non-cached calls.

End to end: answer quality on a 1–5 rubric with a 95% bootstrap confidence interval, cost per 1,000 requests split into Jev, LLM decisions, LLM generation, and embeddings, and LLM calls avoided versus baseline.

Cost comes from `usage.cost` and OpenRouter usage accounting. Missing cost is stored as 0. It is not estimated from tokens.

## Assumptions

- Incident component and severity labels are a documented mapping in `src/domains/incident/labels.ts`, not labels shipped by LogHub. The 200-example gold file is generated from that mapping and should be reviewed before external reporting.
- `best_chunk` options are filled at runtime (at most 8 chunks) because the ids do not exist until retrieval. The static question remains the template.
- `JEV_TRANSPORT=mock` also selects the mock LLM client.
- A write tool with `needs_human` above 0.5 takes the handoff edge and does not change fixture files.
- Incident inputs that contain credential-like text are redacted and the run continues, unless the input is also noise or an injection.
- The validation split is a deterministic 20% carve of train with seed 77. The official Banking77 test split is left intact when `pnpm fetch-data` has downloaded it.
- Noul confidence is `max(p, 1-p)` for both engines. Choice and score use the reported or self-reported confidence.

## Layout

`app/` is the Next.js UI and route handlers. `src/decision` is the engine. `src/graph` is the LangGraph loop. `src/bench` is evaluation. `src/domains` holds the packs. `scripts/` downloads data, builds indexes, runs benchmarks, and writes reports.

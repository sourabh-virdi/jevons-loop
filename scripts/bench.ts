import { loadDotEnv } from "../src/config/load-dotenv";
import { runBenchmark } from "../src/bench/runner";
import { runSweep } from "../src/bench/sweep";
import { comparisonMarkdown } from "../src/bench/compare";
import { getRun } from "../src/bench/report";
import type { CheckpointName, Mode, Split } from "../src/types/contracts";

loadDotEnv();
const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(command === "compare" || command === "sweep" ? rest : process.argv.slice(2));

if (command === "compare") {
  const ids = args.positional;
  const runs = ids.flatMap((id) => {
    const run = getRun(id);
    return run ? [run] : [];
  });
  if (runs.length < 2) {
    console.error("Usage: pnpm bench:compare <runIdA> <runIdB>");
    process.exit(1);
  }
  console.log(comparisonMarkdown(runs));
} else if (command === "sweep") {
  const domain = String(args.flags.domain ?? "support");
  const checkpoint = String(args.flags.checkpoint ?? "router") as CheckpointName;
  const split = String(args.flags.split ?? "validation") as Split;
  const payload = await runSweep({
    domainId: domain,
    checkpoint,
    split,
    n: args.flags.n ? Number(args.flags.n) : undefined,
    seed: args.flags.seed ? Number(args.flags.seed) : undefined,
    tolerance: args.flags.tolerance ? Number(args.flags.tolerance) : undefined,
  });
  console.log(JSON.stringify({ chosen: payload.chosen, points: payload.points.length, baselineAccuracy: payload.baselineAccuracy }, null, 2));
} else {
  const domain = String(args.flags.domain ?? "");
  const mode = String(args.flags.mode ?? "") as Mode;
  if (!domain || !mode) {
    console.error("Usage: pnpm bench -- --domain support --mode hybrid --split test --n 20 --seed 42 [--max-cost-usd 1]");
    process.exit(1);
  }
  const result = await runBenchmark({
    domainId: domain,
    mode,
    split: (String(args.flags.split ?? "test") as Split),
    n: Number(args.flags.n ?? 20),
    seed: Number(args.flags.seed ?? 42),
    maxCostUsd: args.flags["max-cost-usd"] ? Number(args.flags["max-cost-usd"]) : undefined,
  });
  console.log(JSON.stringify({ id: result.id, status: result.status, costPer1k: result.metrics.costPer1k, quality: result.metrics.answerQuality }, null, 2));
  if (result.status === "aborted") process.exit(2);
}

function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? "";
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) flags[key] = true;
      else {
        flags[key] = next;
        i += 1;
      }
    } else positional.push(token);
  }
  return { flags, positional };
}

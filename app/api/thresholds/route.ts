import { eq } from "drizzle-orm";
import { z } from "zod";
import { CHECKPOINT_DEFAULTS } from "@/config/constants";
import { latestSweep } from "@/bench/sweep";
import { getDomain, isDomainId } from "@/domains/registry";
import { getDb } from "@/db/client";
import { thresholds } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const domainId = new URL(request.url).searchParams.get("domain") ?? "support";
  if (!isDomainId(domainId)) return Response.json({ error: "Unknown domain" }, { status: 400 });
  const pack = getDomain(domainId);
  const rows = getDb().select().from(thresholds).where(eq(thresholds.domainId, domainId)).all();
  const saved: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    saved[row.checkpoint] ??= {};
    saved[row.checkpoint]![row.question] = row.value;
  }
  return Response.json({
    domainId,
    defaults: CHECKPOINT_DEFAULTS,
    checkpoints: Object.fromEntries(
      Object.entries(pack.checkpoints).map(([name, checkpoint]) => [
        name,
        {
          gatingQuestions: checkpoint.gatingQuestions,
          thresholds: { ...checkpoint.defaultThresholds, ...(saved[name] ?? {}) },
        },
      ]),
    ),
    sweeps: {
      guardrail: latestSweep(domainId, "guardrail") ?? null,
      router: latestSweep(domainId, "router") ?? null,
      contextCheck: latestSweep(domainId, "contextCheck") ?? null,
      verifier: latestSweep(domainId, "verifier") ?? null,
    },
  });
}

const PutSchema = z.object({
  domainId: z.enum(["support", "incident"]),
  values: z.record(z.string(), z.record(z.string(), z.number().min(0).max(1))),
});

export async function PUT(request: Request) {
  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid thresholds" }, { status: 400 });
  const now = new Date().toISOString();
  for (const [checkpoint, questions] of Object.entries(parsed.data.values)) {
    for (const [question, value] of Object.entries(questions)) {
      const id = `${parsed.data.domainId}:${checkpoint}:${question}`;
      getDb()
        .insert(thresholds)
        .values({ id, domainId: parsed.data.domainId, checkpoint, question, value, updatedAt: now })
        .onConflictDoUpdate({ target: thresholds.id, set: { value, updatedAt: now } })
        .run();
    }
  }
  return Response.json({ ok: true });
}

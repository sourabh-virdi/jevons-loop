import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { runs } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const row = getDb().select().from(runs).where(eq(runs.id, id)).get();
  if (!row) return Response.json({ error: "Run not found" }, { status: 404 });
  return Response.json({
    ...row,
    metrics: row.metricsJson ? JSON.parse(row.metricsJson) : null,
    thresholds: JSON.parse(row.thresholdsJson),
    modelIds: JSON.parse(row.modelIdsJson),
  });
}

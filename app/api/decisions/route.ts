import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { decisions } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");
  const checkpoint = url.searchParams.get("checkpoint");
  const escalated = url.searchParams.get("escalated");
  const disagreement = url.searchParams.get("disagreement");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = 20;
  const filters = [];
  if (domain) filters.push(eq(decisions.domainId, domain));
  if (checkpoint) filters.push(eq(decisions.checkpoint, checkpoint));
  if (escalated === "true" || escalated === "false") filters.push(eq(decisions.escalated, escalated === "true" ? 1 : 0));
  if (disagreement === "true") filters.push(eq(decisions.disagreement, 1));
  const where = filters.length > 0 ? and(...filters) : undefined;
  const rows = getDb()
    .select()
    .from(decisions)
    .where(where)
    .orderBy(desc(decisions.timestamp))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();
  const totalRow = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(decisions)
    .where(where)
    .get();
  return Response.json({
    page,
    pageSize,
    total: totalRow?.count ?? 0,
    decisions: rows.map((row) => ({
      ...row,
      escalated: row.escalated === 1,
      disagreement: row.disagreement === 1,
      primary: JSON.parse(row.primaryJson),
      fallback: row.fallbackJson ? JSON.parse(row.fallbackJson) : null,
    })),
  });
}

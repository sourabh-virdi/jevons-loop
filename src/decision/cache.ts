import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { modelCache } from "@/db/schema";
import type { DecisionResult } from "@/types/contracts";
import { z } from "zod";

const CachedSchema = z.object({
  engine: z.enum(["jev", "llm"]),
  answers: z.record(z.string(), z.unknown()),
  latencyMs: z.number(),
  costUsd: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  rawModelId: z.string(),
  cacheHit: z.boolean(),
  error: z.string().optional(),
});

export interface ModelCache {
  get(hash: string): DecisionResult | undefined;
  set(hash: string, value: DecisionResult): void;
}

export class MemoryModelCache implements ModelCache {
  private readonly store = new Map<string, DecisionResult>();
  get(hash: string): DecisionResult | undefined {
    const hit = this.store.get(hash);
    return hit ? { ...hit, cacheHit: true, latencyMs: 0, costUsd: 0 } : undefined;
  }
  set(hash: string, value: DecisionResult): void {
    this.store.set(hash, value);
  }
}

export class SqliteModelCache implements ModelCache {
  get(hash: string): DecisionResult | undefined {
    const row = getDb().select().from(modelCache).where(eq(modelCache.hash, hash)).get();
    if (!row) return undefined;
    const parsed = CachedSchema.safeParse(JSON.parse(row.responseJson));
    if (!parsed.success) return undefined;
    return { ...(parsed.data as DecisionResult), cacheHit: true, latencyMs: 0, costUsd: 0 };
  }

  set(hash: string, value: DecisionResult): void {
    getDb()
      .insert(modelCache)
      .values({
        hash,
        engine: value.engine,
        responseJson: JSON.stringify(value),
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .run();
  }
}

import { z } from "zod";

const UsageMetaSchema = z
  .object({
    openrouter: z
      .object({
        usage: z
          .object({
            cost: z.number().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** Reported OpenRouter cost. Never estimated from token counts. */
export function readReportedCost(providerMetadata: unknown): number {
  const parsed = UsageMetaSchema.safeParse(providerMetadata);
  if (!parsed.success) return 0;
  return parsed.data.openrouter?.usage?.cost ?? 0;
}

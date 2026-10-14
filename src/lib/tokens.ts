import { stableStringify } from "@/lib/hash";

export function estimateTokens(value: unknown): number {
  const text = typeof value === "string" ? value : stableStringify(value);
  return Math.ceil(text.length / 4);
}

function shrink(value: unknown, budgetChars: number): unknown {
  if (typeof value === "string") {
    return value.length <= budgetChars ? value : `${value.slice(0, Math.max(0, budgetChars))}…`;
  }
  if (Array.isArray(value)) {
    const kept: unknown[] = [];
    for (const item of value) {
      kept.push(item);
      if (stableStringify(kept).length > budgetChars) {
        kept.pop();
        break;
      }
    }
    if (kept.length === 0 && value.length > 0) {
      kept.push(shrink(value[0], budgetChars));
    }
    return kept;
  }
  if (value && typeof value === "object") {
    const record = { ...(value as Record<string, unknown>) };
    if (Array.isArray(record.chunks)) {
      record.chunks = (record.chunks as unknown[]).map((chunk) => {
        if (!chunk || typeof chunk !== "object") return chunk;
        const copy = { ...(chunk as Record<string, unknown>) };
        if (typeof copy.text === "string" && copy.text.length > 240) {
          copy.text = `${copy.text.slice(0, 240)}…`;
        }
        return copy;
      });
    }
    let encoded = stableStringify(record);
    if (encoded.length <= budgetChars) return record;
    const keys = Object.keys(record).sort(
      (a, b) => stableStringify(record[b]).length - stableStringify(record[a]).length,
    );
    for (const key of keys) {
      if (encoded.length <= budgetChars) break;
      record[key] = shrink(record[key], Math.max(32, Math.floor(budgetChars / Math.max(keys.length, 1))));
      encoded = stableStringify(record);
    }
    if (encoded.length > budgetChars) return encoded.slice(0, budgetChars);
    return record;
  }
  return value;
}

/** Enforce the checkpoint token budget before a Jev or LLM decision call. */
export function enforceTokenBudget(state: unknown, budgetTokens: number): unknown {
  if (estimateTokens(state) <= budgetTokens) return state;
  return shrink(state, Math.max(64, budgetTokens * 4));
}

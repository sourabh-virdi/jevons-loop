const DIM = 64;

/** Deterministic hashed bag-of-words embedding so retrieval works with no API key. */
export function localEmbed(text: string): number[] {
  const vec = new Array<number>(DIM).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1);
  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i += 1) {
      hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
    }
    const index = Math.abs(hash) % DIM;
    vec[index] = (vec[index] ?? 0) + 1;
  }
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vec.map((value) => value / norm);
}

export function cosine(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  for (let i = 0; i < length; i += 1) dot += (left[i] ?? 0) * (right[i] ?? 0);
  return dot;
}

export class EngineError extends Error {
  readonly retriable: boolean;
  readonly status?: number;

  constructor(message: string, options: { retriable: boolean; status?: number; cause?: unknown }) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "EngineError";
    this.retriable = options.retriable;
    this.status = options.status;
  }
}

export function isRetriable(error: unknown): boolean {
  return error instanceof EngineError && error.retriable;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Three total attempts, exponential backoff with jitter, only for 429/5xx and transport failures. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { attempts?: number; sleep?: (ms: number) => Promise<void> },
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  const wait = options?.sleep ?? sleep;
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      const retry = isRetriable(error) && attempt < attempts - 1;
      if (!retry) throw error;
      const delay = Math.round(200 * 2 ** attempt * (0.5 + Math.random()));
      await wait(delay);
    }
  }
  throw last;
}

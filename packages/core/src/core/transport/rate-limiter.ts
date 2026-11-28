/**
 * Per-host token bucket with jitter (docs/04-pipeline.md). Jitter spreads load;
 * it is never used to look human (ADR-017).
 */

export type HostLimit = {
  /** Burst size. */
  readonly capacity: number;
  /** Sustained requests per second. */
  readonly refillPerSec: number;
  /** Uniform random extra wait in [0, jitterMs) before every request. */
  readonly jitterMs: number;
};

export type RateLimiterDeps = {
  readonly now: () => number;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly random: () => number;
};

export type RateLimiter = {
  acquire(host: string, limit: HostLimit, signal?: AbortSignal): Promise<void>;
};

type Bucket = { tokens: number; updatedAt: number };

export function createRateLimiter(deps: RateLimiterDeps): RateLimiter {
  const buckets = new Map<string, Bucket>();
  const queues = new Map<string, Promise<void>>();

  async function take(host: string, limit: HostLimit, signal?: AbortSignal): Promise<void> {
    const jitter = Math.floor(deps.random() * limit.jitterMs);
    if (jitter > 0) await deps.sleep(jitter, signal);

    const bucket = buckets.get(host) ?? { tokens: limit.capacity, updatedAt: deps.now() };
    buckets.set(host, bucket);
    const refill = () => {
      const now = deps.now();
      bucket.tokens = Math.min(
        limit.capacity,
        bucket.tokens + ((now - bucket.updatedAt) / 1000) * limit.refillPerSec,
      );
      bucket.updatedAt = now;
    };

    refill();
    if (bucket.tokens < 1) {
      await deps.sleep(Math.ceil(((1 - bucket.tokens) / limit.refillPerSec) * 1000), signal);
      refill();
    }
    bucket.tokens -= 1;
  }

  return {
    acquire(host, limit, signal) {
      const previous = queues.get(host) ?? Promise.resolve();
      const next = previous.then(() => take(host, limit, signal));
      // A failed acquire (aborted) must not block the callers queued behind it.
      queues.set(
        host,
        next.catch(() => undefined),
      );
      return next;
    },
  };
}

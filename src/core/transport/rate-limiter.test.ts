import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limiter";

function fakeClock() {
  let now = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => now,
    sleep: (ms: number) => {
      sleeps.push(ms);
      now += ms;
      return Promise.resolve();
    },
  };
}

describe("createRateLimiter", () => {
  it("lets a burst up to capacity through, then paces at the refill rate", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ ...clock, random: () => 0 });
    const limit = { capacity: 2, refillPerSec: 1, jitterMs: 0 };
    for (let i = 0; i < 4; i += 1) await limiter.acquire("a.test", limit);
    expect(clock.sleeps).toEqual([1000, 1000]);
  });

  it("keeps a separate bucket per host", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ ...clock, random: () => 0 });
    const limit = { capacity: 1, refillPerSec: 1, jitterMs: 0 };
    await limiter.acquire("a.test", limit);
    await limiter.acquire("b.test", limit);
    expect(clock.sleeps).toEqual([]);
  });

  it("refills while time passes", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ ...clock, random: () => 0 });
    const limit = { capacity: 1, refillPerSec: 1, jitterMs: 0 };
    await limiter.acquire("a.test", limit);
    await clock.sleep(1500);
    clock.sleeps.length = 0;
    await limiter.acquire("a.test", limit);
    expect(clock.sleeps).toEqual([]);
  });

  it("adds jitter in [0, jitterMs) before every request", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ ...clock, random: () => 0.5 });
    const limit = { capacity: 1, refillPerSec: 1, jitterMs: 200 };
    await limiter.acquire("a.test", limit);
    await limiter.acquire("a.test", limit);
    // Jitter time also refills the bucket: after 100 ms of jitter, 900 ms remain.
    expect(clock.sleeps).toEqual([100, 100, 900]);
  });

  it("serializes concurrent callers on the same host", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ ...clock, random: () => 0 });
    const limit = { capacity: 1, refillPerSec: 1, jitterMs: 0 };
    await Promise.all([1, 2, 3].map(() => limiter.acquire("a.test", limit)));
    expect(clock.sleeps).toEqual([1000, 1000]);
  });
});

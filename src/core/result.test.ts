import { describe, expect, it } from "vitest";
import { err, ok, type Result } from "./result.js";

function half(n: number): Result<number, string> {
  return n % 2 === 0 ? ok(n / 2) : err("odd");
}

describe("Result", () => {
  it("wraps a success value", () => {
    expect(half(4)).toEqual({ ok: true, value: 2 });
  });

  it("wraps an expected failure without throwing", () => {
    expect(half(3)).toEqual({ ok: false, error: "odd" });
  });
});

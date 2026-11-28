import { describe, expect, it } from "vitest";

// ADR-023: node:sqlite is a release candidate from Node 24.15 on.
const MIN_NODE: readonly [number, number] = [24, 15];

describe("runtime", () => {
  it("runs on a Node version that ships node:sqlite", () => {
    const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
    const [minMajor, minMinor] = MIN_NODE;
    expect(major > minMajor || (major === minMajor && minor >= minMinor)).toBe(true);
  });
});

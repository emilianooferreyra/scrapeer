import { describe, expect, it } from "vitest";
import { cleanText } from "./normalize";

describe("cleanText", () => {
  it.each([
    ["  A   B ", "A B"],
    ["", null],
    ["   ", null],
    [null, null],
    [undefined, null],
  ])("normalizes %j to %j", (input, expected) => {
    expect(cleanText(input)).toBe(expected);
  });
});

import { describe, expect, it } from "vitest";
import { hasCredentials, redactUrl } from "./redact";

describe("redactUrl", () => {
  it("drops userinfo and credential parameters, keeps the rest, and leaves the input unchanged", () => {
    const url = new URL("https://alice:secret@example.org/path?token=abc&fmt=json");
    expect(redactUrl(url)).toBe("https://example.org/path?fmt=json");
    expect(url.href).toBe("https://alice:secret@example.org/path?token=abc&fmt=json");
  });

  it("matches credential parameter names case-insensitively", () => {
    expect(redactUrl(new URL("https://example.org/?API_KEY=a&Key=b&fmt=json"))).toBe(
      "https://example.org/?fmt=json",
    );
  });
});

describe("hasCredentials", () => {
  it.each([
    "https://alice:secret@example.org/x",
    "https://alice@example.org/x",
    "https://example.org/x?API_KEY=a",
    "https://example.org/x?access_token=a",
  ])("detects credentials in %s", (url) => {
    expect(hasCredentials(url)).toBe(true);
  });

  it("accepts a URL without credentials", () => {
    expect(hasCredentials("https://example.org/x?fmt=json")).toBe(false);
  });
});

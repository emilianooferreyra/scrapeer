import { describe, expect, it } from "vitest";
import { isPathAllowed, parseRobots } from "./robots";

const MUSICBRAINZ = [
  "User-agent: *",
  "Disallow: /ws",
  "Disallow: /search",
  "",
  "User-agent: scrapeer",
  "Disallow: /private",
].join("\n");

describe("parseRobots + isPathAllowed", () => {
  it("uses the group named after our token instead of *", () => {
    const rules = parseRobots(MUSICBRAINZ, "scrapeer");
    expect(isPathAllowed(rules, "/ws/2/release/x")).toBe(true);
    expect(isPathAllowed(rules, "/private/a")).toBe(false);
  });

  it("falls back to the * group when no group names our token", () => {
    const rules = parseRobots(MUSICBRAINZ, "otherbot");
    expect(isPathAllowed(rules, "/ws/2/release/x")).toBe(false);
    expect(isPathAllowed(rules, "/release/x")).toBe(true);
  });

  it("matches the token case-insensitively and merges repeated groups", () => {
    const text = "User-agent: ScraPeer\nDisallow: /a\n\nUser-agent: scrapeer\nDisallow: /b";
    const rules = parseRobots(text, "scrapeer");
    expect(isPathAllowed(rules, "/a")).toBe(false);
    expect(isPathAllowed(rules, "/b")).toBe(false);
  });

  it("lets the longest match win, and Allow wins a tie", () => {
    const text = "User-agent: *\nDisallow: /api/\nAllow: /api/public/\nDisallow: /x\nAllow: /x";
    const rules = parseRobots(text, "scrapeer");
    expect(isPathAllowed(rules, "/api/private")).toBe(false);
    expect(isPathAllowed(rules, "/api/public/item")).toBe(true);
    expect(isPathAllowed(rules, "/x")).toBe(true);
  });

  it("supports * and $ in patterns", () => {
    const text = "User-agent: *\nDisallow: /*.json$\nDisallow: /search*q=";
    const rules = parseRobots(text, "scrapeer");
    expect(isPathAllowed(rules, "/data/file.json")).toBe(false);
    expect(isPathAllowed(rules, "/data/file.json?x=1")).toBe(true);
    expect(isPathAllowed(rules, "/search?q=abc")).toBe(false);
  });

  it("ignores comments, unknown keys and an empty Disallow", () => {
    const text = "# hi\nUser-agent: * # all\nCrawl-delay: 8\nDisallow:\n";
    const rules = parseRobots(text, "scrapeer");
    expect(isPathAllowed(rules, "/anything")).toBe(true);
  });

  it("always allows /robots.txt", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /", "scrapeer");
    expect(isPathAllowed(rules, "/robots.txt")).toBe(true);
    expect(isPathAllowed(rules, "/")).toBe(false);
  });

  it("allows everything when the file has no rules for us", () => {
    expect(isPathAllowed(parseRobots("", "scrapeer"), "/x")).toBe(true);
  });
});

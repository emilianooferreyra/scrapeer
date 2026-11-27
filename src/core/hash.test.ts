import { describe, expect, it } from "vitest";
import { canonicalJson, contentHash, sha256 } from "./hash";

describe("hash", () => {
  it("hashes bytes and strings alike", () => {
    expect(sha256("abc")).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256(new TextEncoder().encode("abc"))).toBe(sha256("abc"));
  });

  it("sorts object keys at every level and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,1]},"b":1}',
    );
  });

  it("hashes values with toJSON, such as dates, by their JSON form", () => {
    expect(canonicalJson({ at: new Date(0) })).toBe('{"at":"1970-01-01T00:00:00.000Z"}');
    expect(contentHash({ at: new Date(1) }, [])).not.toBe(contentHash({ at: new Date(2) }, []));
  });

  it("ignores key order and volatile fields in contentHash", () => {
    const volatile = ["provenance"];
    expect(contentHash({ a: 1, b: 2, provenance: "x" }, volatile)).toBe(
      contentHash({ b: 2, a: 1, provenance: "y" }, volatile),
    );
    expect(contentHash({ a: 1 }, volatile)).not.toBe(contentHash({ a: 2 }, volatile));
  });
});

import { describe, expect, it } from "vitest";
import { checkTarget, isPublicAddress } from "./host-guard.js";

describe("checkTarget", () => {
  const hosts = ["musicbrainz.org"];

  it("accepts https on an exact allowed host", () => {
    expect(checkTarget(new URL("https://musicbrainz.org/ws/2/"), hosts).ok).toBe(true);
  });

  it.each([
    ["http://musicbrainz.org/", "plain http"],
    ["https://evil.musicbrainz.org/", "a subdomain"],
    ["https://musicbrainz.org.evil.com/", "a suffix trick"],
    ["https://example.com/", "another host"],
    ["https://user:pass@musicbrainz.org/", "credentials in the URL"],
    ["https://musicbrainz.org:8443/", "a non-default port"],
  ])("rejects %s (%s)", (url) => {
    expect(checkTarget(new URL(url), hosts)).toMatchObject({
      ok: false,
      error: { kind: "host_not_allowed" },
    });
  });
});

describe("isPublicAddress", () => {
  it.each(["138.201.227.205", "2a01:4f8:1c1c:1234::1"])("accepts public %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.9",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::127.0.0.1",
    "64:ff9b::a00:1",
    "2002:a00:1::1",
    "fec0::1",
    "100::1",
    "2001:db8::1",
    "not-an-ip",
  ])("rejects %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

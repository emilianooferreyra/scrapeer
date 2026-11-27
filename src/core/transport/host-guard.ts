import { BlockList, isIP } from "node:net";
import type { ScrapeError } from "../errors.js";
import { err, ok, type Result } from "../result.js";

/** Destination checks that run before every request and on every redirect hop (ADR-018). */
export function checkTarget(url: URL, allowedHosts: readonly string[]): Result<URL, ScrapeError> {
  const reject = (why: string) =>
    err<ScrapeError>({
      kind: "host_not_allowed",
      message: `Refused ${url.origin}: ${why}.`,
    });

  if (url.protocol !== "https:") return reject("only https is allowed");
  if (url.username !== "" || url.password !== "")
    return reject("URLs with credentials are not allowed");
  if (url.port !== "") return reject("only the default https port is allowed");
  if (!allowedHosts.includes(url.hostname)) {
    return reject(`the host is not in this provider's allowlist (${allowedHosts.join(", ")})`);
  }
  return ok(url);
}

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

const MAPPED_V4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

/** True only for a syntactically valid address outside private, loopback, link-local and similar ranges. */
export function isPublicAddress(address: string): boolean {
  const mapped = MAPPED_V4.exec(address)?.[1];
  if (mapped !== undefined) return isPublicAddress(mapped);
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) return !blocked.check(address, "ipv6");
  return false;
}

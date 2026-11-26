import { z } from "zod";
import { HttpUrl, Sha256, Text, UtcTimestamp } from "./primitives.js";

/** Query parameters that carry credentials and must never be persisted. */
const CREDENTIAL_PARAMS = [
  "key",
  "client_id",
  "client_secret",
  "api_key",
  "apikey",
  "access_token",
  "token",
];

function hasCredentials(url: string): boolean {
  const params = new URL(url).searchParams;
  return CREDENTIAL_PARAMS.some((name) => params.has(name));
}

export const Transport = z.enum(["api", "json", "oembed", "html", "browser"]);
export type Transport = z.infer<typeof Transport>;

export const Provenance = z.strictObject({
  /** The URL the user asked for. */
  sourceUrl: HttpUrl,
  /** The URL actually requested, without credentials. */
  requestUrl: HttpUrl.refine((url) => !hasCredentials(url), {
    message: "requestUrl must not contain credentials; redact them before building provenance",
  }),
  fetchedAt: UtcTimestamp,
  transport: Transport,
  /** Evidence of the bytes received. Does not detect changes (ADR-016). */
  rawHash: Sha256,
  /** Hash of the normalized record without volatile fields. Detects changes (ADR-016). */
  contentHash: Sha256,
  providerVersion: Text,
});
export type Provenance = z.infer<typeof Provenance>;

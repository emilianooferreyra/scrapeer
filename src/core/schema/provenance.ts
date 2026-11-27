import { z } from "zod";
import { hasCredentials } from "../redact.js";
import { HttpUrl, Sha256, Text, UtcTimestamp } from "./primitives.js";

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

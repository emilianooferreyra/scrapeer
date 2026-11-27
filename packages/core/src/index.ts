export const TOOL_NAME = "scrapeer";

/** Identifies scrapeer and a contact on every request (ADR-017); never a browser string. */
export const USER_AGENT = "scrapeer/0.0.0 ( https://github.com/emilianooferreyra/scrapeer )";

export type { ScrapeError, ScrapeErrorKind } from "./core/errors";
export type { Capability, Ctx, Provider, ProviderPolicy } from "./core/provider";
export type { Result } from "./core/result";
export type { Collection, Resource, Track } from "./core/schema";
export { silentLogger, type Logger } from "./core/logger";
export {
  createHttpTransport,
  type HttpTransport,
  type HttpTransportOptions,
} from "./core/transport/http";
export { musicbrainz } from "./providers/musicbrainz/provider";

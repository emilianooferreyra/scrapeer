export const TOOL_NAME = "scrapeer";

export { CSV_COLUMNS, resourceToCsv } from "./formats/csv";
export {
  attachmentHeader,
  EXPORT_FORMATS,
  exportResource,
  isExportFormat,
  partialNotice,
  type ExportFile,
  type ExportFormat,
} from "./formats/export";
export {
  createScrapeer,
  USER_AGENT,
  type ResolveOptions,
  type Scrapeer,
  type ScrapeerOptions,
} from "./service";

export { describeError, type ScrapeError, type ScrapeErrorKind } from "./core/errors";
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
export {
  findYouTubeVideo,
  YOUTUBE_API,
  type TrackQuery,
  type YouTubeMatch,
} from "./providers/youtube/search";

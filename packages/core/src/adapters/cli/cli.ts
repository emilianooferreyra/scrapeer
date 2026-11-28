import { join } from "node:path";
import { parseArgs } from "node:util";
import type { ScrapeError } from "../../core/errors";
import { resourceToCsv } from "../../formats/csv";
import type { Resource } from "../../core/schema";
import type { Scrapeer } from "../../service";

/** Where the CLI writes; `main.ts` passes the process streams and the disk, tests pass fakes. */
export type Io = {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  /** Writes a whole file, creating its folder. */
  readonly writeFile: (path: string, text: string) => Promise<void>;
};

/** Default folder for saved files; ignored by git. */
export const DEFAULT_OUT_DIR = "exports";

export const USAGE = `Usage:
  scrapeer resolve <url> [--format json|csv] [--out <dir> | --stdout]
      Resolve a link into a track or an album and save it as a file.

Options:
  --format <json|csv>   json: the full resource (default); csv: one row per track, album order
  --out <dir>           Folder to save in (default: ${DEFAULT_OUT_DIR}/)
  --stdout              Print the result instead of saving it
  -h, --help            Show this help

Exit codes: 0 done, 1 the link could not be resolved or saved, 2 wrong usage.
`;

const FORMATS = ["json", "csv"] as const;
type Format = (typeof FORMATS)[number];

const isFormat = (value: string): value is Format => FORMATS.some((format) => format === value);

/** One line an LLM or a person can act on, e.g. "rate_limited: ... provider=x retryAfter=12s". */
function describe(error: ScrapeError): string {
  const details = [
    error.provider === undefined ? null : `provider=${error.provider}`,
    error.retryAfterSec === undefined ? null : `retryAfter=${error.retryAfterSec}s`,
    error.url === undefined ? null : `url=${error.url}`,
  ].filter((detail) => detail !== null);
  return [`${error.kind}: ${error.message}`, ...details].join(" ");
}

/** Characters a file name cannot hold on common systems; control characters become "_" too. */
const RESERVED = new Set(["/", "\\", ":", "*", "?", '"', "<", ">", "|"]);
const safeChar = (char: string) => (RESERVED.has(char) || char.charCodeAt(0) < 32 ? "_" : char);

/** "Artist - Title (id8).ext": readable, stable for the same link, unique across editions. */
function fileName(resource: Resource, extension: string): string {
  const { artist, title, id } = resource.kind === "track" ? resource.track : resource.collection;
  const label = artist === null ? title : `${artist} - ${title}`;
  const safe = label
    .replace(/./gsu, safeChar)
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 150);
  return `${safe} (${id.slice(0, 8)}).${extension}`;
}

function usageError(io: Io, problem: string): number {
  io.stderr(`scrapeer: ${problem}\n\n${USAGE}`);
  return 2;
}

/** Runs one command; returns the exit code. No business logic here: it lives in the service. */
export async function run(argv: readonly string[], io: Io, scrapeer: Scrapeer): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        format: { type: "string", default: "json" },
        out: { type: "string" },
        stdout: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    return usageError(io, error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (values.help) {
    io.stdout(USAGE);
    return 0;
  }
  const [command, ...rest] = positionals;
  if (command === undefined) return usageError(io, "missing command");
  if (command !== "resolve") return usageError(io, `unknown command "${command}"`);
  const [link] = rest;
  if (link === undefined || rest.length !== 1) return usageError(io, "resolve needs one link");
  if (!isFormat(values.format)) return usageError(io, `unknown format "${values.format}"`);
  if (values.stdout && values.out !== undefined) {
    return usageError(io, "use either --out or --stdout, not both (--out and --stdout)");
  }

  let result;
  try {
    result = await scrapeer.resolve(link);
  } catch (error) {
    // The service returns Results; a throw is a bug. One line still, never a stack trace.
    const reason = error instanceof Error ? error.message : String(error);
    io.stderr(`scrapeer: unexpected error (${reason}); please report it.\n`);
    return 1;
  }
  if (!result.ok) {
    io.stderr(`${describe(result.error)}\n`);
    return 1;
  }
  const text =
    values.format === "csv"
      ? resourceToCsv(result.value)
      : `${JSON.stringify(result.value, null, 2)}\n`;
  if (values.stdout) {
    io.stdout(text);
    return 0;
  }
  const path = join(values.out ?? DEFAULT_OUT_DIR, fileName(result.value, values.format));
  try {
    await io.writeFile(path, text);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : "unknown error";
    io.stderr(`scrapeer: could not write ${path} (${code})\n`);
    return 1;
  }
  io.stdout(`Saved ${path}\n`);
  return 0;
}

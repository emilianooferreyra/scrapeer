import { parseArgs } from "node:util";
import type { ScrapeError } from "../../core/errors";
import { resourceToCsv } from "../../formats/csv";
import type { Scrapeer } from "../../service";

/** Where the CLI writes; `main.ts` passes the process streams, tests pass strings. */
export type Io = {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
};

export const USAGE = `Usage:
  scrapeer resolve <url> [--format json|csv]   Resolve a link into a track or an album

Options:
  --format <json|csv>   json: the full resource (default); csv: one row per track, album order
  -h, --help        Show this help

Exit codes: 0 done, 1 the link could not be resolved, 2 wrong usage.
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
  io.stdout(
    values.format === "csv"
      ? resourceToCsv(result.value)
      : `${JSON.stringify(result.value, null, 2)}\n`,
  );
  return 0;
}

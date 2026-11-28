import { join } from "node:path";
import { parseArgs } from "node:util";
import { exportResource, isExportFormat, type ScrapeError, type Scrapeer } from "../../service";

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
  if (!isExportFormat(values.format)) return usageError(io, `unknown format "${values.format}"`);
  if (values.stdout && values.out !== undefined) {
    return usageError(io, "--out and --stdout cannot be used together");
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
  const { value } = result;
  const { name, text } = exportResource(value, values.format);
  if (value.kind === "collection" && value.page.nextCursor !== null) {
    io.stderr(
      `warning: only the first ${value.page.items.length} tracks are included; the source has more pages (not fetched yet).\n`,
    );
  }
  if (values.stdout) {
    io.stdout(text);
    return 0;
  }
  const path = join(values.out ?? DEFAULT_OUT_DIR, name);
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
  // Status goes to stderr: stdout carries data only, so --stdout output stays pipeable.
  io.stderr(`Saved ${path}\n`);
  return 0;
}

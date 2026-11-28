import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ScrapeError } from "../../core/errors";
import { err, ok, type Result } from "../../core/result";
import { Resource } from "../../core/schema";
import { createScrapeer, type Scrapeer } from "../../service";
import { resourceToCsv } from "../../formats/csv";
import { run } from "./cli";

const LINK = "https://musicbrainz.org/recording/26244520-0e1d-4d42-b101-ce6b83299d33";

/** A real resolved track: the recorded fixture through the real provider. */
const recording = readFileSync(
  new URL("../../../fixtures/musicbrainz/recording-several-isrcs.json", import.meta.url),
  "utf8",
);
const resolved = await createScrapeer({
  transport: {
    id: "http",
    get: async (url) =>
      ok({
        status: 200,
        requestUrl: url,
        finalUrl: url,
        headers: new Headers({ "content-type": "application/json" }),
        body: new TextEncoder().encode(recording),
        fetchedAt: "2026-11-27T22:06:51.312Z",
        access: "official_api",
      }),
  },
}).resolve(LINK);
if (!resolved.ok) throw new Error(resolved.error.message);
const track = resolved.value;

async function cli(
  argv: string[],
  answer: Result<Resource, ScrapeError> = ok(track),
  writeFile: (path: string, text: string) => Promise<void> = async () => undefined,
) {
  const resolve = vi.fn<Scrapeer["resolve"]>(async () => answer);
  const write = vi.fn<(path: string, text: string) => Promise<void>>(writeFile);
  let stdout = "";
  let stderr = "";
  const code = await run(
    argv,
    {
      stdout: (text) => void (stdout += text),
      stderr: (text) => void (stderr += text),
      writeFile: write,
    },
    { resolve },
  );
  return { code, stdout, stderr, resolve, writes: write.mock.calls };
}

const SAVED = "exports/Bob Dylan - Like a Rolling Stone (26244520)";

describe("scrapeer CLI", () => {
  it("resolve <url> saves the JSON in exports/ by default and says where", async () => {
    const out = await cli(["resolve", LINK]);
    expect(out).toMatchObject({ code: 0, stderr: "", stdout: `Saved ${SAVED}.json\n` });
    expect(out.writes).toStrictEqual([[`${SAVED}.json`, `${JSON.stringify(track, null, 2)}\n`]]);
    expect(out.resolve.mock.calls).toStrictEqual([[LINK]]);
  });

  it("--format csv saves the CSV view in exports/", async () => {
    const out = await cli(["resolve", LINK, "--format", "csv"]);
    expect(out).toMatchObject({ code: 0, stderr: "", stdout: `Saved ${SAVED}.csv\n` });
    expect(out.writes).toStrictEqual([[`${SAVED}.csv`, resourceToCsv(track)]]);
  });

  it("--out <dir> saves in that folder instead", async () => {
    const out = await cli(["resolve", LINK, "--format", "csv", "--out", "data/albums"]);
    const path = "data/albums/Bob Dylan - Like a Rolling Stone (26244520).csv";
    expect(out).toMatchObject({ code: 0, stdout: `Saved ${path}\n` });
    expect(out.writes.map(([written]) => written)).toStrictEqual([path]);
  });

  it("keeps the file name safe: no path separators or reserved characters", async () => {
    if (track.kind !== "track") throw new Error("track");
    const odd: Resource = {
      kind: "track",
      track: { ...track.track, artist: "AC/DC", title: '../What? "Now": <Yes>|*' },
    };
    const out = await cli(["resolve", LINK], ok(odd));
    expect(out.writes.map(([written]) => written)).toStrictEqual([
      "exports/AC_DC - .._What_ _Now__ _Yes___ (26244520).json",
    ]);
  });

  it("reports a file it cannot write as one line and exits 1", async () => {
    const out = await cli(["resolve", LINK], ok(track), async () => {
      throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    });
    expect(out).toMatchObject({
      code: 1,
      stdout: "",
      stderr: `scrapeer: could not write ${SAVED}.json (EACCES)\n`,
    });
  });

  it("--stdout prints the JSON instead of saving it", async () => {
    const out = await cli(["resolve", LINK, "--stdout"]);
    expect(out.writes).toStrictEqual([]);
    expect(out.code).toBe(0);
    expect(out.stderr).toBe("");
    expect(Resource.parse(JSON.parse(out.stdout))).toStrictEqual(track);
    expect(out.stdout.endsWith("}\n")).toBe(true);
    expect(out.resolve.mock.calls).toStrictEqual([[LINK]]);
  });

  it("accepts --format json explicitly", async () => {
    const out = await cli(["resolve", LINK, "--format", "json", "--stdout"]);
    expect(out.code).toBe(0);
    expect(JSON.parse(out.stdout)).toStrictEqual(
      JSON.parse((await cli(["resolve", LINK, "--stdout"])).stdout),
    );
  });

  it("--format csv --stdout prints the CSV view instead of saving it", async () => {
    const out = await cli(["resolve", LINK, "--format", "csv", "--stdout"]);
    expect(out).toMatchObject({ code: 0, stderr: "", stdout: resourceToCsv(track), writes: [] });
    expect(out.stdout.startsWith("schemaVersion,provider,id,url,")).toBe(true);
  });

  it("prints a scrape error on stderr as one line and exits 1", async () => {
    const out = await cli(
      ["resolve", LINK],
      err({
        kind: "rate_limited",
        message: "MusicBrainz is busy.",
        provider: "musicbrainz",
        retryAfterSec: 12,
      }),
    );
    expect(out).toMatchObject({
      code: 1,
      stdout: "",
      stderr: "rate_limited: MusicBrainz is busy. provider=musicbrainz retryAfter=12s\n",
    });
  });

  it("prints only kind and message when the error has no details", async () => {
    const out = await cli(
      ["resolve", "x"],
      err({ kind: "invalid_input", message: "That is not a link." }),
    );
    expect(out).toMatchObject({
      code: 1,
      stdout: "",
      stderr: "invalid_input: That is not a link.\n",
    });
  });

  it("adds the failing URL to the error line when the error has one", async () => {
    const out = await cli(
      ["resolve", LINK],
      err({
        kind: "robots_disallowed",
        message: "robots.txt disallows it.",
        provider: "musicbrainz",
        url: "https://musicbrainz.org/release/x",
      }),
    );
    expect(out.stderr).toBe(
      "robots_disallowed: robots.txt disallows it. provider=musicbrainz url=https://musicbrainz.org/release/x\n",
    );
  });

  it("reports a service that throws as one line and exits 1, not a stack trace", async () => {
    let stdout = "";
    let stderr = "";
    const code = await run(
      ["resolve", LINK],
      {
        stdout: (text) => void (stdout += text),
        stderr: (text) => void (stderr += text),
        writeFile: async () => undefined,
      },
      { resolve: () => Promise.reject(new Error("boom")) },
    );
    expect({ code, stdout, stderr }).toStrictEqual({
      code: 1,
      stdout: "",
      stderr: "scrapeer: unexpected error (boom); please report it.\n",
    });
  });

  it("--help prints the usage on stdout and exits 0", async () => {
    const out = await cli(["--help"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("scrapeer resolve <url>");
    expect(out.stderr).toBe("");
  });

  it.each([
    [[], "missing command"],
    [["resolve"], "resolve needs one link"],
    [["resolve", LINK, LINK], "resolve needs one link"],
    [["search", "creep"], 'unknown command "search"'],
    [["resolve", LINK, "--format", "xml"], 'unknown format "xml"'],
    [["resolve", LINK, "--nope"], "--nope"],
    [["resolve", LINK, "--stdout", "--out", "x"], "--out and --stdout"],
  ])("%j is a usage error: exit 2, usage on stderr, no lookup", async (argv, problem) => {
    const out = await cli(argv);
    expect(out.code).toBe(2);
    expect(out.stdout).toBe("");
    expect(out.stderr).toContain(problem);
    expect(out.stderr).toContain("scrapeer resolve <url>");
    expect(out.resolve).not.toHaveBeenCalled();
  });
});

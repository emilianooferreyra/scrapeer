import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";
import { createScrapeer } from "../../service";
import { run } from "./cli";

/** Entry point: `pnpm scrapeer resolve <url>`. */
process.exitCode = await run(
  process.argv.slice(2),
  {
    stdout: (text) => void process.stdout.write(text),
    stderr: (text) => void process.stderr.write(text),
    writeFile: async (path, text) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text, "utf8");
    },
  },
  createScrapeer(),
);

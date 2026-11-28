import process from "node:process";
import { createScrapeer } from "../../service";
import { run } from "./cli";

/** Entry point: `pnpm scrapeer resolve <url>`. */
process.exitCode = await run(
  process.argv.slice(2),
  {
    stdout: (text) => void process.stdout.write(text),
    stderr: (text) => void process.stderr.write(text),
  },
  createScrapeer(),
);

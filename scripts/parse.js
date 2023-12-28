#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import * as parser from "../dist/erq.js";

async function main() {
  const filenames = process.argv.slice(2);
  for (const filename of filenames) {
    if (!filename || !filename.endsWith(".erq")) {
      console.error("Usage: node parse.js <filename>");
      process.exit(1);
    }
    const input = await readFile(filename, { encoding: "utf-8" });
    const sqls = parser.parse(input, { startRule: "cli_readline" });
    const output = JSON.stringify(sqls, null, 2) + "\n";
    const outputFile = join(dirname(filename), basename(filename, ".erq") + ".parsed.json")
    await writeFile(outputFile, output);
  }
}

await main();

import { DEBUG_PARSER } from "./options.js";
import { readFile, writeFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import * as erqParser from "../dist/erq.js";

let parser = erqParser;

if (DEBUG_PARSER) {
  try {
    const peggy = (await import("peggy")).default;
    const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), "erq.pegjs"), "utf-8");
    const parserSource = peggy.generate(source, {
      allowedStartRules: ["start", "cli_readline", "script"],
      trace: true,
      output: "source",
      format: "es",
    });
    await writeFile(join(dirname(fileURLToPath(import.meta.url)), "../dist/erq-debug.js"), parserSource, "utf-8");
    // @ts-ignore
    parser = await import("../dist/erq-debug.js");
  } catch (e) {
    console.error(e);
    // ignore error
  }
}

export { parser }

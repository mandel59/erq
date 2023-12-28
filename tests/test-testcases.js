import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import test from "ava";

import * as parser from "../dist/erq.js";

const dirs = readdirSync("tests/testcases");
for (const dir of dirs) {
  const files = readdirSync(`tests/testcases/${dir}`);
  for (const file of files) {
    if (!file.endsWith(".erq")) continue;
    test(`${dir}/${basename(file, ".erq")}`, async (t) => {
      const erqInput = await readFile(`tests/testcases/${dir}/${file}`, { encoding: "utf-8" });
      const erqOutputExpected = await readFile(`tests/testcases/${dir}/${file.replace(/\.erq$/, ".parsed.json")}`, { encoding: "utf-8" });
      const expected = JSON.parse(erqOutputExpected);
      const actual = JSON.parse(JSON.stringify(parser.parse(erqInput, { startRule: "cli_readline" })));
      t.deepEqual(actual, expected);
    });
  }
}

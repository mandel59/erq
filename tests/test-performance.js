import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { parser } from "../src/parser.js";

const maxIteration = 10;
const timeoutForEachIteration = 5000;

const files = readdirSync("tests/performance");
for (const file of files) {
  if (!file.endsWith(".erq")) continue;
  test(`performance/${basename(file, ".erq")}`, { timeout: maxIteration * timeoutForEachIteration }, async () => {
    const erqInput = await readFile(`tests/performance/${file}`, { encoding: "utf-8" });
    const erqOutputExpected = await readFile(`tests/performance/${file.replace(/\.erq$/, ".parsed.json")}`, { encoding: "utf-8" });
    const expected = JSON.parse(erqOutputExpected);

    for (let i = 0; i < maxIteration; i++) {
      performance.mark("parse-start");
      const parsed = parser.parse(erqInput, { startRule: "cli_readline" });
      performance.mark("parse-end");
      performance.measure("parse-measure", "parse-start", "parse-end");

      const actual = JSON.parse(JSON.stringify(parsed));

      assert.deepStrictEqual(actual, expected);
    }

    const parseMeasures = performance.getEntriesByName("parse-measure");
    const durations = parseMeasures.map(m => m.duration);
    const sum = durations.reduce((x, y) => x + y, 0);
    const average = sum / durations.length;

    assert.ok(average < 1000, `${average} is not less than 1000`);
  });
}

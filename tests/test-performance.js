import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import test from "ava";

import * as parser from "../dist/erq.js";

const files = readdirSync("tests/performance");
for (const file of files) {
  if (!file.endsWith(".erq")) continue;
  test(`performance/${basename(file, ".erq")}`, async (t) => {
    const maxIteration = 10;
    const timeoutForEachIteration = 5000;
    t.timeout(maxIteration * timeoutForEachIteration);

    const erqInput = await readFile(`tests/performance/${file}`, { encoding: "utf-8" });
    const erqOutputExpected = await readFile(`tests/performance/${file.replace(/\.erq$/, ".parsed.json")}`, { encoding: "utf-8" });
    const expected = JSON.parse(erqOutputExpected);

    for (let i = 0; i < maxIteration; i++) {
      performance.mark("parse-start");
      const parsed = parser.parse(erqInput, { startRule: "cli_readline" });
      performance.mark("parse-end");
      performance.measure("parse-measure", "parse-start", "parse-end");

      const actual = JSON.parse(JSON.stringify(parsed));

      t.deepEqual(actual, expected);
    }

    const parseMeasures = performance.getEntriesByName("parse-measure");
    const durations = parseMeasures.map(m => m.duration);
    const sum = durations.reduce((x, y) => x + y, 0);
    const average = sum / durations.length;

    t.assert(average < 1000, `${average} is not less than 1000`);
  });
}

import test from "node:test";
import { readdirSync, createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { spawn } from "node:child_process";
import streamConsumers from "node:stream/consumers";
import assert from "node:assert";
import looksSame from "looks-same";

const dirs = readdirSync("testcases");

for (const dir of dirs) {
  const files = readdirSync(`testcases/${dir}`);
  for (const file of files) {
    if (!file.endsWith(".erq")) continue;
    const erqBaseName = basename(file, '.erq');
    const outFile = files.find((f) => f.startsWith(`${erqBaseName}.out`));
    if (!outFile) {
      console.warn(`WARN Skipping test case ${dir}/${basename(file, '.erq')}`);
      continue;
    }
    if (outFile.endsWith('.png')) {
      test(`${dir}/${basename(file, '.erq')}`, async (t) => {
        const erqInput = createReadStream(`testcases/${dir}/${file}`);
        const erqOutputExpected = await readFile(`testcases/${dir}/${outFile}`);
        const erqProcess = spawn("erq", [], {
          stdio: ["pipe", "pipe", "ignore"],
          timeout: 10000,
        });
        erqInput.pipe(erqProcess.stdin);
        const erqOutputPromise = streamConsumers.buffer(erqProcess.stdout);
        const erqExitCode = await new Promise((resolve) => {
          erqProcess.once("exit", (code) => { resolve(code); })
        });
        const erqOutputActual = await erqOutputPromise;
        const { equal } = await looksSame(erqOutputActual, erqOutputExpected);
        assert.ok(equal);
      });
    } else if (outFile.endsWith('.json')) {
      test(`${dir}/${basename(file, '.erq')}`, async (t) => {
        const erqInput = createReadStream(`testcases/${dir}/${file}`);
        const erqOutputExpected = await readFile(`testcases/${dir}/${outFile}`);
        const expected = { exitCode: 0, output: JSON.parse(erqOutputExpected.toString()) };
        const erqProcess = spawn("erq", [], {
          stdio: ["pipe", "pipe", "ignore"],
          timeout: 10000,
        });
        erqInput.pipe(erqProcess.stdin);
        const erqOutputPromise = streamConsumers.buffer(erqProcess.stdout);
        const erqExitCode = await new Promise((resolve) => {
          erqProcess.once("exit", (code) => { resolve(code); })
        });
        const erqOutputActual = await erqOutputPromise;
        const actual = { exitCode: erqExitCode, output: JSON.parse(erqOutputActual.toString()) };
        assert.deepEqual(actual, expected);
      });
    } else {
      test(`${dir}/${basename(file, '.erq')}`, async (t) => {
        const erqInput = createReadStream(`testcases/${dir}/${file}`);
        const erqOutputExpected = await readFile(`testcases/${dir}/${outFile}`);
        const expected = { exitCode: 0, output: erqOutputExpected };
        const erqProcess = spawn("erq", [], {
          stdio: ["pipe", "pipe", "ignore"],
          timeout: 10000,
        });
        erqInput.pipe(erqProcess.stdin);
        const erqOutputPromise = streamConsumers.buffer(erqProcess.stdout);
        const erqExitCode = await new Promise((resolve) => {
          erqProcess.once("exit", (code) => { resolve(code); })
        });
        const erqOutputActual = await erqOutputPromise;
        const actual = { exitCode: erqExitCode, output: erqOutputActual };
        assert.deepEqual(actual, expected);
      });
    }
  }
}

import test from "node:test";
import { readdirSync, createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, basename, isAbsolute } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";
import streamConsumers from "node:stream/consumers";
import assert from "node:assert/strict";
import looksSame from "looks-same";
import { fileURLToPath } from "node:url";

const testRoot = fileURLToPath(new URL("./", import.meta.url));
const casesRoot = join(testRoot, "testcases");
const erqCliPath = process.env.ERQ_TEST_CLI ?? fileURLToPath(new URL("../bin/erq-cli.js", import.meta.url));
assert.ok(isAbsolute(erqCliPath), "ERQ_TEST_CLI must be an absolute path.");

// Allow cold native/Vega initialization on shared CI runners while bounding hangs.
const cliTimeoutMs = 60_000;

async function runErq(inputPath) {
  const child = spawn(process.execPath, [erqCliPath], {
    cwd: testRoot,
    env: { ...process.env, ERQ_DEBUG: "" },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: cliTimeoutMs,
  });
  const input = pipeline(createReadStream(inputPath), child.stdin).catch(error => {
    // A CLI that fails before reading its input can close stdin early.
    if (error.code !== "EPIPE" && error.code !== "ERR_STREAM_PREMATURE_CLOSE") throw error;
  });
  const [output, stderr, [code, signal]] = await Promise.all([
    streamConsumers.buffer(child.stdout),
    streamConsumers.text(child.stderr),
    once(child, "close"),
    input,
  ]);
  assert.strictEqual(code, 0, `CLI failed for ${basename(inputPath)} (signal: ${signal}, timeout: ${cliTimeoutMs}ms):\n${stderr}`);
  return output;
}

for (const dir of readdirSync(casesRoot)) {
  const files = readdirSync(join(casesRoot, dir));
  for (const file of files) {
    if (!file.endsWith(".erq")) continue;
    const name = basename(file, ".erq");
    const outFile = files.find(f => f.startsWith(`${name}.out`));
    if (!outFile) {
      console.warn(`WARN Skipping test case ${dir}/${name}`);
      continue;
    }
    test(`${dir}/${name}`, async () => {
      const expected = await readFile(join(casesRoot, dir, outFile));
      const actual = await runErq(join(casesRoot, dir, file));
      if (outFile.endsWith(".png")) {
        const { equal } = await looksSame(actual, expected);
        assert.ok(equal, "CLI image differs from the expected image.");
      } else if (outFile.endsWith(".json")) {
        assert.deepStrictEqual(JSON.parse(actual.toString()), JSON.parse(expected.toString()));
      } else {
        assert.strictEqual(actual.toString(), expected.toString());
      }
    });
  }
}

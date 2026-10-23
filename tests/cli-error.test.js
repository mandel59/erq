import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = resolve(projectRoot, "bin/erq-cli.js");

/**
 * Runs the Erq CLI with the provided input and returns execution details.
 * @param {string} input
 * @param {string[]} [args]
 * @param {string[]} [nodeArgs]
 */
function runErqCli(input, args = [], nodeArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...nodeArgs, cliPath, ...args], {
      cwd: projectRoot,
      env: { ...process.env, ERQ_DEBUG: "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
    if (input != null) {
      child.stdin.end(input);
    } else {
      child.stdin.end();
    }
  });
}

test("fails when referencing missing table", async () => {
  const result = await runErqCli("invalid;;\n");
  assert.notStrictEqual(result.code, 0);
  assert.strictEqual(result.stderr.includes("Connected to :memory:"), true);
  assert.strictEqual(result.stderr.includes("SqliteError: no such table: invalid"), true);
  assert.strictEqual(result.stdout, "");
});

test("shows usage when .format receives invalid mode", async () => {
  const result = await runErqCli(".format foo\n;;\n");
  assert.notStrictEqual(result.code, 0);
  assert.strictEqual(result.stderr.includes("usage: .format MODE"), true);
  assert.strictEqual(result.stderr.includes("MODE is one of"), true);
  assert.strictEqual(result.stdout, "");
});

test("reports syntax errors with location information", async () => {
  const result = await runErqCli("select {;;\n");
  assert.notStrictEqual(result.code, 0);
  assert.strictEqual(result.stderr.includes("SyntaxError"), true);
  assert.strictEqual(result.stderr.includes("line 1 column"), true);
  assert.strictEqual(result.stdout, "");
});

test(".help lists dot commands", async () => {
  const result = await runErqCli(".help\n");
  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.stderr.includes("Connected to :memory:"), true);
  assert.strictEqual(result.stderr.includes("Available dot commands:"), true);
  assert.strictEqual(result.stderr.includes(".debug"), true);
  assert.strictEqual(result.stdout, "");
});

test(".help debug shows detail", async () => {
  const result = await runErqCli(".help debug\n");
  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.stderr.includes(".debug"), true);
  assert.strictEqual(result.stderr.includes("Available categories"), true);
  assert.strictEqual(result.stdout, "");
});

test(".help unknown command fails", async () => {
  const result = await runErqCli(".help unknown\n");
  assert.notStrictEqual(result.code, 0);
  assert.strictEqual(result.stderr.includes("Unknown dot command"), true);
  assert.strictEqual(result.stdout, "");
});

const delayedStdioArgs = ["--import", new URL("./fixtures/delayed-stdio.js", import.meta.url).href];

test("flushes pending stdout before a successful exit", async () => {
  const result = await runErqCli('range(1, 10) {value};;\n', [], delayedStdioArgs);
  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.stdout, Array.from({ length: 10 }, (_, i) => `[${i + 1}]\n`).join(""));
  assert.ok(result.stderr.includes("Connected to :memory:"));
});

test("flushes pending stdout and stderr before a failed exit", async () => {
  const result = await runErqCli('"hello";; invalid;;\n', [], delayedStdioArgs);
  assert.strictEqual(result.code, 1);
  assert.strictEqual(result.stdout, '["hello"]\n');
  assert.ok(result.stderr.includes("SqliteError: no such table: invalid"));
});

import test from "ava";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = resolve(projectRoot, "bin/erq-cli.js");

/**
 * Runs the Erq CLI with the provided input and returns execution details.
 * @param {string} input
 * @param {string[]} [args]
 */
function runErqCli(input, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
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

test.serial("fails when referencing missing table", async (t) => {
  const result = await runErqCli("invalid;;\n");
  t.not(result.code, 0);
  t.true(result.stderr.includes("Connected to :memory:"));
  t.true(result.stderr.includes("SqliteError: no such table: invalid"));
  t.is(result.stdout, "");
});

test.serial("shows usage when .format receives invalid mode", async (t) => {
  const result = await runErqCli(".format foo\n;;\n");
  t.not(result.code, 0);
  t.true(result.stderr.includes("usage: .format MODE"));
  t.true(result.stderr.includes("MODE is one of"));
  t.is(result.stdout, "");
});

test.serial("reports syntax errors with location information", async (t) => {
  const result = await runErqCli("select {;;\n");
  t.not(result.code, 0);
  t.true(result.stderr.includes("SyntaxError"));
  t.true(result.stderr.includes("line 1 column"));
  t.is(result.stdout, "");
});

test.serial(".help lists dot commands", async (t) => {
  const result = await runErqCli(".help\n");
  t.is(result.code, 0);
  t.true(result.stderr.includes("Connected to :memory:"));
  t.true(result.stderr.includes("Available dot commands:"));
  t.true(result.stderr.includes(".debug"));
  t.is(result.stdout, "");
});

test.serial(".help debug shows detail", async (t) => {
  const result = await runErqCli(".help debug\n");
  t.is(result.code, 0);
  t.true(result.stderr.includes(".debug"));
  t.true(result.stderr.includes("Available categories"));
  t.is(result.stdout, "");
});

test.serial(".help unknown command fails", async (t) => {
  const result = await runErqCli(".help unknown\n");
  t.not(result.code, 0);
  t.true(result.stderr.includes("Unknown dot command"));
  t.is(result.stdout, "");
});

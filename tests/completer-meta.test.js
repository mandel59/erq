import test, { after } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

import { ErqCliCompleter } from "../src/completer.js";

const db = new Database(":memory:");
const completer = new ErqCliCompleter({
  db,
  findModules: () => [],
});

after(() => {
  db.close();
});

test("completes dot command names", async () => {
  const [suggestions, prefix] = await completer.complete(".d");
  assert.deepStrictEqual(prefix, ".d");
  assert.strictEqual(suggestions.includes(".debug"), true);
  assert.strictEqual(suggestions.every((value) => value.startsWith(".")), true);
});

test("suggests .help when requested", async () => {
  const [suggestions, prefix] = await completer.complete(".h");
  assert.deepStrictEqual(prefix, ".h");
  assert.strictEqual(suggestions.includes(".help"), true);
});

test("completes .help arguments", async () => {
  const [suggestions, prefix] = await completer.complete(".help d");
  assert.strictEqual(prefix, "d");
  assert.strictEqual(suggestions.includes("debug"), true);
});

test("completes .format arguments", async () => {
  const [suggestions, prefix] = await completer.complete(".format ");
  assert.strictEqual(prefix, "");
  assert.deepStrictEqual(suggestions.sort(), ["array", "object"]);
});

test("filters used debug categories", async () => {
  const [suggestions, prefix] = await completer.complete(".debug sql ");
  assert.strictEqual(prefix, "");
  assert.strictEqual(suggestions.some((value) => value.toLowerCase() === "sql"), false);
});

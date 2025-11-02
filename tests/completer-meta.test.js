import test from "ava";
import Database from "better-sqlite3";

import { ErqCliCompleter } from "../src/completer.js";

const db = new Database(":memory:");
const completer = new ErqCliCompleter({
  db,
  findModules: () => [],
});

test.after.always(() => {
  db.close();
});

test("completes dot command names", async (t) => {
  const [suggestions, prefix] = await completer.complete(".d");
  t.deepEqual(prefix, ".d");
  t.true(suggestions.includes(".debug"));
  t.true(suggestions.every((value) => value.startsWith(".")));
});

test("suggests .help when requested", async (t) => {
  const [suggestions, prefix] = await completer.complete(".h");
  t.deepEqual(prefix, ".h");
  t.true(suggestions.includes(".help"));
});

test("completes .help arguments", async (t) => {
  const [suggestions, prefix] = await completer.complete(".help d");
  t.is(prefix, "d");
  t.true(suggestions.includes("debug"));
});

test("completes .format arguments", async (t) => {
  const [suggestions, prefix] = await completer.complete(".format ");
  t.is(prefix, "");
  t.deepEqual(suggestions.sort(), ["array", "object"]);
});

test("filters used debug categories", async (t) => {
  const [suggestions, prefix] = await completer.complete(".debug sql ");
  t.is(prefix, "");
  t.false(suggestions.some((value) => value.toLowerCase() === "sql"));
});

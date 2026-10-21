import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  DEBUG,
  debugEnabled,
  debugLog,
  getDebugConfiguration,
  setDebugLogging,
  resolveDebugInput,
} from "../src/debug.js";

const originalDebugRaw = getDebugConfiguration().raw;
const originalEnvDebug = process.env.ERQ_DEBUG;

afterEach(() => {
  setDebugLogging(originalDebugRaw);
  if (originalEnvDebug === undefined) {
    delete process.env.ERQ_DEBUG;
  } else {
    process.env.ERQ_DEBUG = originalEnvDebug;
  }
});

test("debug defaults to disabled", () => {
  setDebugLogging("");
  assert.strictEqual(DEBUG, false);
  assert.strictEqual(debugEnabled(), false);
  assert.strictEqual(debugEnabled("sql"), false);
  assert.deepStrictEqual(getDebugConfiguration(), {
    enabled: false,
    all: false,
    categories: [],
    raw: "",
  });
});

test("debug categories are case insensitive", () => {
  setDebugLogging("SQL stack");
  assert.strictEqual(debugEnabled("sql"), true);
  assert.strictEqual(debugEnabled("stack"), true);
  assert.strictEqual(debugEnabled("lifecycle"), false);
  const messages = [];
  const original = console.error;
  console.error = (...args) => {
    messages.push(args);
  };
  try {
    debugLog("sql", "select 1");
    debugLog("stack", "trace");
    debugLog("lifecycle", "ignored");
  } finally {
    console.error = original;
  }
  assert.deepStrictEqual(messages, [["select 1"], ["trace"]]);
  assert.deepStrictEqual(getDebugConfiguration(), {
    enabled: true,
    all: false,
    categories: ["sql", "stack"],
    raw: "SQL stack",
  });
});

test("truthy tokens enable all logging", () => {
  setDebugLogging("1");
  assert.strictEqual(debugEnabled("anything"), true);
  const messages = [];
  const original = console.error;
  console.error = (...args) => {
    messages.push(args);
  };
  try {
    debugLog("sql", "select 1");
    debugLog("stack", "trace");
  } finally {
    console.error = original;
  }
  assert.deepStrictEqual(messages, [["select 1"], ["trace"]]);
});

test("resolveDebugInput normalizes tokens", () => {
  assert.deepStrictEqual(resolveDebugInput(""), { ok: false });
  assert.deepStrictEqual(resolveDebugInput(" off "), { ok: true, value: "" });
  assert.deepStrictEqual(resolveDebugInput("enabled"), { ok: true, value: "all" });
  assert.deepStrictEqual(resolveDebugInput("sql stack"), { ok: true, value: "sql stack" });
});

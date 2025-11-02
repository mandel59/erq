import test from "ava";

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

test.afterEach.always(() => {
  setDebugLogging(originalDebugRaw);
  if (originalEnvDebug === undefined) {
    delete process.env.ERQ_DEBUG;
  } else {
    process.env.ERQ_DEBUG = originalEnvDebug;
  }
});

test.serial("debug defaults to disabled", (t) => {
  setDebugLogging("");
  t.false(DEBUG);
  t.false(debugEnabled());
  t.false(debugEnabled("sql"));
  t.deepEqual(getDebugConfiguration(), {
    enabled: false,
    all: false,
    categories: [],
    raw: "",
  });
});

test.serial("debug categories are case insensitive", (t) => {
  setDebugLogging("SQL stack");
  t.true(debugEnabled("sql"));
  t.true(debugEnabled("stack"));
  t.false(debugEnabled("lifecycle"));
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
  t.deepEqual(messages, [["select 1"], ["trace"]]);
  t.deepEqual(getDebugConfiguration(), {
    enabled: true,
    all: false,
    categories: ["sql", "stack"],
    raw: "SQL stack",
  });
});

test.serial("truthy tokens enable all logging", (t) => {
  setDebugLogging("1");
  t.true(debugEnabled("anything"));
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
  t.deepEqual(messages, [["select 1"], ["trace"]]);
});

test("resolveDebugInput normalizes tokens", (t) => {
  t.deepEqual(resolveDebugInput(""), { ok: false });
  t.deepEqual(resolveDebugInput(" off "), { ok: true, value: "" });
  t.deepEqual(resolveDebugInput("enabled"), { ok: true, value: "all" });
  t.deepEqual(resolveDebugInput("sql stack"), { ok: true, value: "sql stack" });
});

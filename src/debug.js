import process from "node:process";

let rawDebugValue = process.env["ERQ_DEBUG"] ?? "";

/** @type {Set<string>} */
const debugCategories = new Set();

let debugAll = false;

export let DEBUG = false;

const truthyTokens = new Set(["1", "true", "yes", "on", "all", "*"]);
const truthyAliasTokens = new Set(["enable", "enabled"]);
const falsyTokens = new Set(["0", "false", "no", "off", "none"]);
const falsyAliasTokens = new Set(["disable", "disabled"]);

function applyDebugConfiguration(value) {
  rawDebugValue = value ?? "";
  debugCategories.clear();
  debugAll = false;
  const trimmed = rawDebugValue.trim();
  if (trimmed !== "") {
    const tokens = trimmed.split(/[,\s]+/).filter(Boolean);
    if (tokens.length === 0) {
      debugAll = true;
    } else {
      for (const token of tokens) {
        const normalized = token.toLowerCase();
        if (truthyTokens.has(normalized) || truthyAliasTokens.has(normalized)) {
          debugAll = true;
          break;
        }
        if (falsyTokens.has(normalized) || falsyAliasTokens.has(normalized)) {
          continue;
        }
        debugCategories.add(normalized);
      }
    }
  }
  DEBUG = debugAll || debugCategories.size > 0;
}

applyDebugConfiguration(rawDebugValue);

/**
 * @param {string | string[]} [category]
 */
function shouldLog(category = "general") {
  if (!DEBUG) return false;
  if (debugAll) return true;
  const categories = Array.isArray(category) ? category : [category];
  for (const value of categories) {
    const normalized = String(value ?? "").toLowerCase();
    if (debugCategories.has(normalized)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true when debug logging is enabled for the given category.
 * @param {string | string[]} [category]
 */
export function debugEnabled(category = "general") {
  return shouldLog(category);
}

/**
 * Logs through stderr when the category is enabled.
 * @param {string | string[]} category
 * @param {...any} args
 */
export function debugLog(category, ...args) {
  if (!shouldLog(category)) return;
  console.error(...args);
}

/**
 * Creates a convenience logger bound to the given category.
 * @param {string | string[]} category
 */
export function createDebugLogger(category) {
  return (...args) => {
    debugLog(category, ...args);
  };
}

/**
 * Updates debug configuration using the provided raw value.
 * @param {string} [value]
 */
export function setDebugLogging(value = process.env["ERQ_DEBUG"] ?? "") {
  applyDebugConfiguration(value);
}

/**
 * Normalizes user-provided debug input into a canonical configuration string.
 * Returns `{ ok: false }` when the input is empty.
 * @param {string} input
 */
export function resolveDebugInput(input) {
  const raw = (input ?? "").trim();
  if (raw === "") {
    return { ok: false };
  }
  const normalized = raw.toLowerCase();
  if (falsyTokens.has(normalized) || falsyAliasTokens.has(normalized)) {
    return { ok: true, value: "" };
  }
  if (truthyTokens.has(normalized) || truthyAliasTokens.has(normalized)) {
    return { ok: true, value: "all" };
  }
  return { ok: true, value: raw };
}

export function getDebugConfiguration() {
  return {
    enabled: DEBUG,
    all: debugAll,
    categories: Array.from(debugCategories.values()).sort(),
    raw: rawDebugValue,
  };
}

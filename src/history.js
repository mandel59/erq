import { readFileSync, writeFileSync } from "node:fs";

import { isTTY } from "./io.js";

export const ERQ_HISTORY = process.env["ERQ_HISTORY"];

export function loadHistory() {
  if (isTTY && ERQ_HISTORY) {
    try {
      return readFileSync(ERQ_HISTORY, "utf-8").split("\n").filter(line => line);
    } catch {
      // ignore
    }
  }
  return [];
}

export function saveHistory(history) {
  if (ERQ_HISTORY) {
    try {
      writeFileSync(ERQ_HISTORY, history.join("\n"), "utf-8");
    } catch {
      // ignore
    }
  }
}

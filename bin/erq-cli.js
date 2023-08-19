#!/usr/bin/env node
import process from "node:process";

if (process.connected) {
  const { child } = await import("../src/child.js");
  await child();
} else {
  const { parent } = await import("../src/parent.js");
  await parent();
}

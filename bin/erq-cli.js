#!/usr/bin/env node
import process, { stdin, stdout, stderr } from "node:process";
import { readFileSync } from "node:fs";
import readline from "node:readline";
import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";
import Database from "better-sqlite3";
import peggy from "peggy";

const optionList = [
  { name: 'help', alias: 'h', type: Boolean, description: 'show Usage' },
  { name: 'db', type: String, typeLabel: '{underline path}', defaultOption: true, description: 'path to SQLite database file' },
];

function showUsage() {
  const sections = [
    {
      header: 'Erq CLI',
      content: 'Erq-powered SQLite client',
    },
    {
      header: 'Options',
      optionList
    }
  ];
  const usage = commandLineUsage(sections);
  console.error(usage);
}

const syntax = readFileSync(new URL("../src/erq.pegjs", import.meta.url).pathname, "utf-8")
const parser = peggy.generate(syntax, {
  allowedStartRules: ["start", "cli_readline"],
});

const options = commandLineArgs(optionList);

if (options.help) {
  showUsage();
  process.exit();
}

const dbpath = options.db ?? ":memory:";
const db = new Database(dbpath);
console.error("Connected to %s", dbpath);

const rl = readline.createInterface({
  input: stdin,
  output: stderr,
  prompt: 'erq> ',
});

const isTTY = stdin.isTTY && stderr.isTTY;

let outputStream = stdout;

/** @type {"read" | "eval"} */
let state = "read";
let input = "";

function resetReadline() {
  input = "";
  rl.setPrompt('erq> ');
  if (isTTY) { rl.prompt(); }
}

let sigint = false;
function handleSigint() {
  if (state === "read") {
    rl.clearLine(0);
    resetReadline();
  } else {
    sigint = true;
  }
}
rl.on("SIGINT", handleSigint);

async function parseErq() {
  try {
    const sqls = parser.parse(input, { startRule: "cli_readline" });
    input = "";
    return sqls;
  } catch (error) {
    if (error.found == null) {
      input += "\n";
      rl.setPrompt('...> ');
      if (isTTY) { rl.prompt(); }
      return null;
    }
    console.error(error.message);
    if (error && error.location) {
      const start = error.location.start.offset;
      const end = error.location.end.offset;
      if (stderr.isTTY) {
        console.error(
          '%s',
          input.slice(0, start)
          + '\x1b[1m\x1b[37m\x1b[41m'
          + input.slice(start, end)
          + '\x1b[0m' + input.slice(end));
      }
      console.error(JSON.stringify(error.location));
    }
    resetReadline();
  }
  return null;
}

async function runSqls(sqls) {
  state = "eval";
  try {
    for (const sql of sqls) {
      console.error(sql);
      const t0 = performance.now();
      const stmt = db.prepare(sql);
      stmt.raw(true);
      const columns = stmt.columns();
      const columnNames = columns.map(c => c.name);
      console.error(JSON.stringify(columnNames));
      let i = 0;
      sigint = false;
      for (const r of stmt.iterate()) {
        i++;
        if (!outputStream.write(JSON.stringify(r) + "\n")) {
          await new Promise(resolve => outputStream.once("drain", () => resolve()));
        } else if (i % 100 === 0) {
          await new Promise(resolve => setImmediate(() => resolve()));
        }
        if (sigint) {
          console.error("Interrupted");
          break;
        }
      }
      const t1 = performance.now();
      const rows = (i === 1) ? "1 row" : `${i} rows`;
      const t = t1 - t0;
      console.error("%s (%ss)", rows, (t / 1000).toFixed(3));
    }
  } catch (error) {
    console.error(error.message);
  } finally {
    state = "read";
  }
}

if (isTTY) { rl.prompt(); }
rl.on("line", async (line) => {
  input += line;
  const sqls = await parseErq();
  if (sqls != null) {
    await runSqls(sqls);
    resetReadline();
  }
});
rl.on("close", async () => {
  if (input !== null) {
    input += "\n;;";
    const sqls = await parseErq();
    if (sqls != null) {
      await runSqls(sqls);
    }
  }
});

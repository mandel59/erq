#!/usr/bin/env node
import { stdin, stderr } from "node:process";
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
const parser = peggy.generate(syntax);

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

let input = '';
if (isTTY) { rl.prompt(); }
for await (const line of rl) {
  input += line + '\n';
  try {
    const sql = parser.parse(input);
    try {
      console.error(sql);
      const t0 = performance.now();
      const stmt = db.prepare(sql);
      stmt.raw(true);
      const columns = stmt.columns();
      const columnNames = columns.map(c => c.name);
      console.error(JSON.stringify(columnNames));
      let i = 0;
      for (const r of stmt.iterate()) {
        console.log(JSON.stringify(r));
        i++;
      }
      const t1 = performance.now();
      const rows = (i === 1) ? "1 row" : `${i} rows`;
      const t = t1 - t0;
      console.error("%s (%ss)", rows, (t / 1000).toFixed(3));
    } catch (error) {
      console.error(error.message);
    }
  } catch (error) {
    if (error.found == null) {
      rl.setPrompt('...> ');
      if (isTTY) { rl.prompt(); }
      continue;
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
  }
  input = '';
  rl.setPrompt('erq> ');
  if (isTTY) { rl.prompt(); }
}

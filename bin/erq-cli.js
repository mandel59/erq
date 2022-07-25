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
  // trace: true,
});

const options = commandLineArgs(optionList);

if (options.help) {
  showUsage();
  process.exit();
}

const dbpath = options.db ?? ":memory:";
// TODO: add flag and command to allow modifing database
const readonly = dbpath !== ":memory:";
const db = new Database(dbpath, { readonly });
console.error("Connected to %s", dbpath);

// user functions

db.table("string_split", {
  parameters: ["string", "separator"],
  columns: ["value"],
  rows: function* (
    /** @type {string} */ string,
    /** @type {string} */ separator) {
    for (const value of separator === "" ? string : string.split(separator)) {
      yield [value];
    }
  }
});

// global states

/** @type {"read" | "eval"} */
let state = "read";
let input = "";
let sigint = false;

// autocompleter

const patName = "[\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}][\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}\\p{Mc}\\p{Nd}\\p{Pc}\\p{Cf}]*"
const patQuot = "(?<![\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}\\p{Mc}\\p{Nd}\\p{Pc}\\p{Cf}])`[^`]*`"
const patPart = "(?<![\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}\\p{Mc}\\p{Nd}\\p{Pc}\\p{Cf}])`[^`]*"
const reName = new RegExp(`^${patName}$`, "u");
const reFQNamePart = new RegExp(`(?:(?:${patName}|${patQuot})\\.){0,2}(?:${patName}|${patQuot}|${patPart})?$`, "u");
const reParseColumnName = new RegExp(`^(${patName}|${patQuot})(?:\\.(${patName}|${patQuot}))?\\.(${patName}|${patQuot}|${patPart})?$`, "u");

function quoteSQLName(name) {
  if (!reName.test(name)) {
    return `\`${name.replace(/`/g, "``")}\``;
  }
  return name;
}

function unquoteSQLName(quot) {
  if (quot[0] === "`") {
    if (quot[quot.length - 1] === "`") {
      return quot.substring(1, quot.length - 1).replace(/``/g, "`");
    }
    return quot.substring(1).replace(/``/g, "`");
  }
  return quot;
}

function getTables() {
  /** @type {{schema: string, name: string, type: string, ncol: number, wr: 0 | 1, strict: 0 | 1}[]} */
  const tables = db.prepare("pragma table_list").all();
  return tables;
}

function getColumns(schema, table) {
  /** @type {{cid: number, name: string, type: string, notnull: 0 | 1, dflt_value: any, pk: 0 | 1, hidden: 0 | 1 | 2}[]} */
  const columns = db.prepare(`pragma ${quoteSQLName(schema)}.table_xinfo(${quoteSQLName(table)})`).all();
  return columns;
}

function completer(line) {
  const m = reFQNamePart.exec(line);
  const q = m[0];
  try {
    const tables = getTables();
    const schemas = Array.from(new Set(tables.map(t => t.schema)).values(), s => quoteSQLName(s));
    const tableNamesFQ = tables.map(t => `${quoteSQLName(t.schema)}.${quoteSQLName(t.name)}`);
    const tableNames = tables.map(t => quoteSQLName(t.name));
    // column completion
    {
      const m = reParseColumnName.exec(q);
      if (m != null) {
        const m1 = unquoteSQLName(m[1]);
        const m2 = m[2] && unquoteSQLName(m[2]);
        const m3 = m[3] ? unquoteSQLName(m[3]) : "";
        const [sn, tn] = (m2 != null) ? [m1, m2] : [tables.find(t => t.name === m1)?.schema, m1];
        if (schemas.includes(sn)) {
          const columns = getColumns(sn, tn).filter(c => c.hidden !== 1 && c.name.startsWith(m3));
          if (m2 != null) {
            const qtn = `${quoteSQLName(sn)}.${quoteSQLName(tn)}`;
            return [columns.map(c => `${qtn}.${quoteSQLName(c.name)}`), q];
          } else {
            const qtn = quoteSQLName(tn);
            return [columns.map(c => `${qtn}.${quoteSQLName(c.name)}`), q];
          }
        }
      }
    }
    // other name completion
    const columnNames = tables.flatMap(t => {
      return getColumns(t.schema, t.name)
        .filter(c => c.hidden !== 1)
        .map(c => quoteSQLName(c.name));
    });
    {
      const qq = q.replace(/`/g, "");
      const matches
        = Array.from(new Set([...schemas, ...tableNames, ...tableNamesFQ, ...columnNames]).values())
          .filter(n => {
            return n.replace(/`/g, "").startsWith(qq);
          })
          .sort();
      if (matches.length > 0) {
        return [matches, q];
      }
    }
  } catch (error) {
    // ignore errors
    // console.error(error);
  }
  return [[], q];
}

// readline

const rl = readline.createInterface({
  input: stdin,
  output: stderr,
  completer,
  prompt: 'erq> ',
});

const isTTY = stdin.isTTY && stderr.isTTY;

let outputStream = stdout;

function setPrompt() {
  if (input === "") {
    rl.setPrompt("erq> ");
  } else {
    rl.setPrompt("...> ");
  }
}

function handleSigint() {
  if (state === "read") {
    rl.clearLine(0);
    input = "";
    setPrompt();
    if (isTTY) { rl.prompt(); }
  } else {
    sigint = true;
  }
}
rl.on("SIGINT", handleSigint);

function handleSigcont() {
  if (state === "read") {
    // resume the stream
    rl.prompt();
  }
}
rl.on("SIGCONT", handleSigcont);

function parseErq() {
  try {
    const sqls = parser.parse(input, { startRule: "cli_readline" });
    input = "";
    return sqls;
  } catch (error) {
    if (error.found == null) {
      return null;
    }
    console.error(error.message);
    if (error && error.location) {
      const start = error.location.start.offset;
      const end = error.location.end.offset;
      console.error(" at line %d column %d", error.location.start.line, error.location.start.column);
      if (stderr.isTTY) {
        console.error("---");
        console.error(
          '%s',
          input.slice(0, start)
          + '\x1b[1m\x1b[37m\x1b[41m'
          + input.slice(start, end)
          + '\x1b[0m' + input.slice(end));
        console.error("---");
      }
    }
    input = "";
  }
  return null;
}

async function runSqls(statements) {
  try {
    for (const { type, query: sql } of statements) {
      if (sigint) {
        break;
      }
      console.error(sql);
      const t0 = performance.now();
      const stmt = db.prepare(sql);
      if (type === "select") {
        stmt.raw(true);
        // stmt.safeIntegers(true);
        const columns = stmt.columns();
        const columnNames = columns.map(c => c.name);
        console.error(JSON.stringify(columnNames));
        let i = 0;
        for (const r of stmt.iterate()) {
          i++;
          if (!outputStream.write(JSON.stringify(r.map(value => {
            if (value != null && typeof value === "object") {
              // convert Buffer object to Array object
              return Array.from(value);
            }
            if (typeof value === "bigint") {
              return String(value);
            }
            return value;
          })) + "\n")) {
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
        const t = t1 - t0;
        const rows = (i === 1) ? "1 row" : `${i} rows`;
        console.error("%s (%ss)", rows, (t / 1000).toFixed(3));
      } else {
        const { changes, lastInsertRowid } = stmt.run();
        const t1 = performance.now();
        const t = t1 - t0;
        const rows = (changes === 1) ? "1 row" : `${changes} rows`;
        if (type === "insert") {
          console.error("%s changed, lastInsertRowid=%s (%ss)", rows, lastInsertRowid, (t / 1000).toFixed(3));
        } else if (type === "update") {
          console.error("%s changed (%ss)", rows, (t / 1000).toFixed(3));
        } else {
          console.error("ok (%ss)", (t / 1000).toFixed(3));
        }
      }
    }
  } catch (error) {
    console.error(error.message);
  }
}

if (isTTY) { rl.prompt(); }
rl.on("line", async (line) => {
  if (input !== "") {
    input += "\n";
  }
  input += line;
  if (state === "read") {
    state = "eval";
    try {
      if (!isTTY) {
        // slurp all input
        return;
      }
      while (input !== "") {
        const sqls = parseErq();
        if (sqls == null) {
          break;
        }
        await runSqls(sqls);
      }
      setPrompt();
      if (isTTY) {
        rl.prompt();
      }
    } finally {
      sigint = false;
      state = "read";
    }
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

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

// global states

/** @type {"read" | "eval"} */
let state = "read";
let input = "";
let sigint = false;

// autocompleter

const keywords = new Set([
  "ABORT",
  "ACTION",
  "ADD",
  "AFTER",
  "ALL",
  "ALTER",
  "ALWAYS",
  "ANALYZE",
  "AND",
  "AS",
  "ASC",
  "ATTACH",
  "AUTOINCREMENT",
  "BEFORE",
  "BEGIN",
  "BETWEEN",
  "BY",
  "CASCADE",
  "CASE",
  "CAST",
  "CHECK",
  "COLLATE",
  "COLUMN",
  "COMMIT",
  "CONFLICT",
  "CONSTRAINT",
  "CREATE",
  "CROSS",
  "CURRENT",
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "DATABASE",
  "DEFAULT",
  "DEFERRABLE",
  "DEFERRED",
  "DELETE",
  "DESC",
  "DETACH",
  "DISTINCT",
  "DO",
  "DROP",
  "EACH",
  "ELSE",
  "END",
  "ESCAPE",
  "EXCEPT",
  "EXCLUDE",
  "EXCLUSIVE",
  "EXISTS",
  "EXPLAIN",
  "FAIL",
  "FILTER",
  "FIRST",
  "FOLLOWING",
  "FOR",
  "FOREIGN",
  "FROM",
  "FULL",
  "GENERATED",
  "GLOB",
  "GROUP",
  "GROUPS",
  "HAVING",
  "IF",
  "IGNORE",
  "IMMEDIATE",
  "IN",
  "INDEX",
  "INDEXED",
  "INITIALLY",
  "INNER",
  "INSERT",
  "INSTEAD",
  "INTERSECT",
  "INTO",
  "IS",
  "ISNULL",
  "JOIN",
  "KEY",
  "LAST",
  "LEFT",
  "LIKE",
  "LIMIT",
  "MATCH",
  "MATERIALIZED",
  "NATURAL",
  "NO",
  "NOT",
  "NOTHING",
  "NOTNULL",
  "NULL",
  "NULLS",
  "OF",
  "OFFSET",
  "ON",
  "OR",
  "ORDER",
  "OTHERS",
  "OUTER",
  "OVER",
  "PARTITION",
  "PLAN",
  "PRAGMA",
  "PRECEDING",
  "PRIMARY",
  "QUERY",
  "RAISE",
  "RANGE",
  "RECURSIVE",
  "REFERENCES",
  "REGEXP",
  "REINDEX",
  "RELEASE",
  "RENAME",
  "REPLACE",
  "RESTRICT",
  "RETURNING",
  "RIGHT",
  "ROLLBACK",
  "ROW",
  "ROWS",
  "SAVEPOINT",
  "SELECT",
  "SET",
  "TABLE",
  "TEMP",
  "TEMPORARY",
  "THEN",
  "TIES",
  "TO",
  "TRANSACTION",
  "TRIGGER",
  "UNBOUNDED",
  "UNION",
  "UNIQUE",
  "UPDATE",
  "USING",
  "VACUUM",
  "VALUES",
  "VIEW",
  "VIRTUAL",
  "WHEN",
  "WHERE",
  "WINDOW",
  "WITH",
  "WITHOUT",
]);

const patName = "[\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}][\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}\\p{Mc}\\p{Nd}\\p{Pc}\\p{Cf}]*"
const patQuot = "`[^`]*`"
const patPart = "`[^`]*"
const reName = new RegExp(`^${patName}$`, "u");
const reFQNamePart = new RegExp(`(?:(?:${patName}|${patQuot})\\.){0,2}(?:${patName}|${patQuot}|${patPart})?$`, "u");
const reParseColumnName = new RegExp(`^(${patName}|${patQuot})(?:\\.(${patName}|${patQuot}))?\\.(${patName}|${patQuot}|${patPart})?$`, "u");

function quoteSQLName(name) {
  if (keywords.has(name.toUpperCase())) {
    return `\`${name}\``;
  }
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
  const tables = getTables();
  const schemas = Array.from(new Set(tables.map(t => t.schema)).values());
  const tableNamesFQ = tables.map(t => `${quoteSQLName(t.schema)}.${quoteSQLName(t.name)}`);
  const tableNames = tables.map(t => quoteSQLName(t.name));
  const q = m[0];
  // column completion
  {
    const m = reParseColumnName.exec(q);
    if (m != null) {
      const m1 = unquoteSQLName(m[1]);
      const m2 = m[2] && unquoteSQLName(m[2]);
      const m3 = m[3] ? unquoteSQLName(m[3]) : "";
      const [sn, tn] = (m2 != null) ? [m1, m2] : [tables.find(t => t.name === m1)?.schema, m1];
      if (sn != null) {
        const columns = getColumns(sn, tn).filter(c => c.hidden !== 1 && c.name.startsWith(m3));
        if (m2 != null) {
          const qtn = `${quoteSQLName(sn)}.${quoteSQLName(tn)}`;
          return [columns.map(c => `${qtn}.${c.name}`), q];
        } else {
          const qtn = quoteSQLName(tn);
          return [columns.map(c => `${qtn}.${c.name}`), q];
        }
      }
    }
  }
  // table name completion
  {
    const matches = [...schemas, ...tableNames, ...tableNamesFQ].filter(n => n.startsWith(q)).sort();
    if (matches.length > 0) {
      return [matches, q];
    }
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

async function parseErq() {
  try {
    const sqls = parser.parse(input, { startRule: "cli_readline" });
    input = "";
    return sqls;
  } catch (error) {
    if (error.found == null) {
      input += "\n";
      setPrompt();
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
    input = "";
    setPrompt();
    if (isTTY) {
      rl.prompt();
    }
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
        const columns = stmt.columns();
        const columnNames = columns.map(c => c.name);
        console.error(JSON.stringify(columnNames));
        let i = 0;
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
  if (state === "read") {
    state = "eval";
    try {
      input += line;
      while (input !== "") {
        const sqls = await parseErq();
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
  } else {
    if (input !== "") {
      input += "\n";
    }
    input += line;
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

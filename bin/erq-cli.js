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

// builtin functions

const sqliteFunctionsList = `
// built-in scalar SQL functions
abs(X)
changes()
char(X1,X2,...,XN)
coalesce(X,Y,...)
format(FORMAT,...)
glob(X,Y)
hex(X)
ifnull(X,Y)
iif(X,Y,Z)
instr(X,Y)
last_insert_rowid()
length(X)
like(X,Y)
like(X,Y,Z)
likelihood(X,Y)
likely(X)
// load_extension(X)
// load_extension(X,Y)
lower(X)
ltrim(X)
ltrim(X,Y)
max(X,Y,...)
min(X,Y,...)
nullif(X,Y)
printf(FORMAT,...)
quote(X)
random()
randomblob(N)
replace(X,Y,Z)
round(X)
round(X,Y)
rtrim(X)
rtrim(X,Y)
sign(X)
soundex(X)
sqlite_compileoption_get(N)
sqlite_compileoption_used(X)
sqlite_offset(X)
sqlite_source_id()
sqlite_version()
substr(X,Y)
substr(X,Y,Z)
substring(X,Y)
substring(X,Y,Z)
total_changes()
trim(X)
trim(X,Y)
typeof(X)
unicode(X)
unlikely(X)
upper(X)
zeroblob(N)
// date and time functions
date(time-value, modifier, modifier, ...)
time(time-value, modifier, modifier, ...)
datetime(time-value, modifier, modifier, ...)
julianday(time-value, modifier, modifier, ...)
unixepoch(time-value, modifier, modifier, ...)
strftime(format, time-value, modifier, modifier, ...)
// built-in aggregate functions
avg(X)
count(*)
count(X)
group_concat(X)
group_concat(X,Y)
max(X)
min(X)
sum(X)
// window functions
row_number()
rank()
dense_rank()
percent_rank()
cume_dist()
ntile(N)
lag(expr)
lag(expr, offset)
lag(expr, offset, default)
lead(expr)
lead(expr, offset)
lead(expr, offset, default)
first_value(expr)
last_value(expr)
nth_value(expr, N)
// built-in mathematical functions
acos(X)
acosh(X)
asin(X)
asinh(X)
atan(X)
atan2(Y,X)
atanh(X)
ceil(X)
ceiling(X)
cos(X)
cosh(X)
degrees(X)
exp(X)
floor(X)
ln(X)
log(B,X)
log(X)
log10(X)
log2(X)
mod(X,Y)
pi()
pow(X,Y)
power(X,Y)
radians(X)
sin(X)
sinh(X)
sqrt(X)
tan(X)
tanh(X)
trunc(X)
// JSON scalar functions
json(json)
json_array(value1,value2,...)
json_array_length(json)
json_array_length(json,path)
json_extract(json,path,...)
json_insert(json,path,value,...)
json_object(label1,value1,...)
json_patch(json1,json2)
json_remove(json,path,...)
json_replace(json,path,value,...)
json_set(json,path,value,...)
json_type(json)
json_type(json,path)
json_valid(json)
json_quote(value)
// JSON aggregate functions
json_group_array(value)
json_group_object(name,value)
// JSON table-valued functions
json_each(json)
json_each(json,path)
json_tree(json)
json_tree(json,path)
// FTS3 and FTS4 extensions
fts3()
fts4()
offsets(X)
snippet(X)
matchinfo(X)
// FTS5 extension
fts5()
bm25(X)
highlight(X,Y,Z,W)
snippet(X)
// R*Tree module
rtree()
rtreecheck(R)
rtreecheck(S,R)
// geopoly interface to the R*Tree module
geopoly()
geopoly_overlap(P1,P2)
geopoly_within(P1,P2)
geopoly_area(P)
geopoly_blob(P)
geopoly_json(P)
geopoly_svg(P,...)
geopoly_bbox(P)
geopoly_group_bbox(P)
geopoly_contains_point(P,X,Y)
geopoly_xform(P,A,B,C,D,E,F)
geopoly_regular(X,Y,R,N)
geopoly_ccw(J)
`

const erqFunctions = new Set(
  sqliteFunctionsList
    .replace(/\/\/[^\n]*\n/g, "")
    .match(/\w+\(/g)
    .map(x => x.substring(0, x.length - 1)));

// user functions

function defineTable(
  /** @type {string} */ name,
  /** @type {BetterSqlite3.VirtualTableOptions} */ options
) {
  erqFunctions.add(name);
  db.table(name, options);
}

function defineFunction(
  /** @type {string} */ name,
  /** @type {Database.RegistrationOptions} */ options,
  /** @type {(...params: any[]) => any} */ func
) {
  erqFunctions.add(name);
  db.function(name, options, func);
}

defineTable("string_split", {
  parameters: ["string", "separator"],
  columns: ["value"],
  rows: function* (string, separator) {
    for (const value of separator === "" ? String(string) : String(string).split(separator)) {
      yield [value];
    }
  }
});

defineFunction("unhex", { deterministic: true }, function (string) {
  return Buffer.from(string, "hex");
});

defineFunction("parse_int", { deterministic: true, safeIntegers: true }, function (string, radix) {
  if (typeof radix !== "bigint" || radix < 2n || radix > 36n) {
    throw RangeError("parse_int() radix must be an integer in range [2, 36]");
  }
  if (string == null) {
    return null;
  }
  if (radix === 10n) {
    return BigInt(string);
  }
  const n = parseInt(string, Number(radix));
  if (Number.isSafeInteger(n)) {
    return BigInt(n);
  } else {
    throw RangeError("parse_int() cannot convert to a 64-bit signed integer");
  }
});

defineFunction("regexp", { deterministic: true }, function (pattern, string) {
  return Number(new RegExp(pattern, "gu").test(string));
});

defineFunction("regexp_replace", { deterministic: true }, function (source_string, pattern, replace_string) {
  return String(source_string).replace(new RegExp(pattern, "gu"), replace_string);
});

defineFunction("regexp_substr", { deterministic: true }, function (string, pattern) {
  const re = new RegExp(pattern, "gu");
  const m = re.exec(string);
  if (m) {
    return m[0];
  }
  return null;
});

defineTable("regexp_substr_all", {
  parameters: ["string", "pattern"],
  columns: ["value"],
  rows: function* (
    /** @type {string} */ string,
    /** @type {string} */ pattern) {
    const re = new RegExp(pattern, "gu");
    let m;
    while (m = re.exec(string)) {
      yield [m[0]];
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
        = Array.from(new Set([
          ...schemas,
          ...tableNames,
          ...tableNamesFQ,
          ...columnNames,
          ...erqFunctions]).values())
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
    console.error("%s: %s", error.name, error.message);
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
    console.error("%s: %s", error.name, error.message);
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

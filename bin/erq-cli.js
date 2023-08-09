#!/usr/bin/env node
import process, { stdin, stdout, stderr } from "node:process";
import { readFileSync, writeFileSync, readdirSync, readlinkSync, statSync, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { resolve as pathResolve, basename, dirname } from "node:path"
import readline from "node:readline";
import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";
import Database from "better-sqlite3";
import { parse as parseCSV } from "csv-parse";
import ndjson from "ndjson";
import iconv from "iconv-lite";
import jsdom from "jsdom";
import { NodeVM } from "vm2";
import memoizedJsonHash from "@mandel59/memoized-json-hash";
import { feature } from "topojson-client";
import vega from "vega"
import vegaLite from "vega-lite"
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import parser from "../dist/erq.cjs";
import { uncons } from "../src/async-iter.js";

const DEBUG = Boolean(process.env["ERQ_DEBUG"]);
const ERQ_HISTORY = process.env["ERQ_HISTORY"];
const isTTY = stdin.isTTY && stderr.isTTY;

function loadHistory() {
  if (isTTY && ERQ_HISTORY) {
    try {
      return readFileSync(ERQ_HISTORY, "utf-8").split("\n").filter(line => line);
    } catch {
      // ignore
    }
  }
  return [];
}

function saveHistory(history) {
  if (ERQ_HISTORY) {
    try {
      writeFileSync(ERQ_HISTORY, history.join("\n"), "utf-8");
    } catch {
      // ignore
    }
  }
}

const optionList = [
  { name: 'help', alias: 'h', type: Boolean, description: 'show Usage' },
  { name: 'version', alias: 'v', type: Boolean, description: 'show Version' },
  { name: 'load', alias: 'l', typeLabel: '{underline path}', type: String, lazyMultiple: true, defaultValue: [], description: 'load extension' },
  { name: 'init', alias: 'i', type: String, typeLabel: '{underline path}', description: 'path to initialize Erq file' },
  { name: 'format', alias: 'f', type: String, typeLabel: '{underline mode}', description: 'output format' },
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

function showVersion() {
  const packagejson = readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf-8");
  const erqVersion = JSON.parse(packagejson).version;
  const db = new Database(":memory:");
  const sqliteVersion = db.prepare("select sqlite_version()").pluck().get();
  console.log("Erq CLI version %s", erqVersion);
  console.log("SQLite version %s", sqliteVersion);
}

const options = commandLineArgs(optionList);
if (options.help) {
  showUsage();
  process.exit();
}
if (options.version) {
  showVersion();
  process.exit();
}

if (DEBUG) {
  console.error("%s process start", process.connected ? "child" : "parent");
}

if (process.connected) {
  child();
} else {
  parent();
}

/**
 * @param {(name: string, options: Database.RegistrationOptions, func: (...params: any[]) => any) => void} defineFunction 
 * @param {(name: string, options: BetterSqlite3.VirtualTableOptions) => void} defineTable 
 * @param {(name: string, options: BetterSqlite3.AggregateOptions) => void} defineAggregate
 */
function defineUserFunctions(defineFunction, defineTable, defineAggregate) {
  defineTable("string_split", {
    parameters: ["_string", "_delimiter"],
    columns: ["value"],
    rows: function* (string, delimiter) {
      if (typeof string !== "string") throw new TypeError("string_split(string,delimiter) string must be a string");
      if (typeof delimiter !== "string") throw new TypeError("string_split(string,delimiter) delimiter must be a string");
      for (const value of delimiter === "" ? Array.from(string) : String(string).split(delimiter)) {
        yield [value];
      }
    }
  });

  defineFunction("split_part", { deterministic: true }, function (string, delimiter, count) {
    if (typeof delimiter !== "string") throw new TypeError("split_part(string,delimiter,count) delimiter must be a string");
    if (typeof count !== "number" || !Number.isSafeInteger(count)) throw new TypeError("split_part(string,delimiter,count) count must be an integer");
    if (string == null) return null;
    return String(string).split(delimiter)[count - 1] ?? null;
  });

  defineFunction("unhex", { deterministic: true }, function (string) {
    return Buffer.from(string, "hex");
  });

  defineFunction("parse_int", { deterministic: true, safeIntegers: true }, function (string, radix) {
    if (typeof radix !== "bigint" || radix < 2n || radix > 36n) {
      throw RangeError("parse_int(string,radix) radix must be an integer in range [2, 36]");
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
      throw RangeError("parse_int(string,radix) cannot convert to a 64-bit signed integer");
    }
  });

  defineFunction("to_enum", { deterministic: true, varargs: true, safeIntegers: true }, function (value, ...enumDefs) {
    const i = enumDefs.indexOf(value) + 1;
    if (i === 0) return null;
    return BigInt(i);
  });

  defineFunction("from_enum", { deterministic: true, varargs: true, safeIntegers: true }, function (value, ...enumDefs) {
    if (value == null) return null;
    return enumDefs[BigInt(value) - 1n] ?? null;
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
    parameters: ["_string", "_pattern"],
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

  defineTable("xml_tree", {
    parameters: ["_xml", "content_type", "url", "referrer"],
    columns: ["id", "parent", "type", "name", "value", "attributes"],
    rows: function* (
      /** @type {string | null} */ xml,
      /** @type {string | null} */ contentType,
      /** @type {string | null} */ url,
      /** @type {string | null} */ referrer,
    ) {
      if (xml == null) {
        return;
      }
      if (contentType == null) {
        contentType = "application/xml";
      }
      const { window } = new jsdom.JSDOM(xml, {
        contentType,
        url,
        referrer,
      });
      const result = window.document.evaluate("//node()", window.document, null, window.XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
      /** @type {Map<Node, number>} */
      const idmap = new Map();
      let id = 0;
      /** @type {Node} */
      let n;
      while (n = result.iterateNext()) {
        id += 1;
        const attrs = /** @type {Element} */ (n).attributes;
        yield [
          id,
          idmap.get(n.parentNode) ?? 0,
          n.nodeType,
          n.nodeName,
          n.nodeValue,
          attrs ? JSON.stringify(Object.fromEntries(Array.from(attrs, (attr) => [attr.name, attr.value]))) : null,
        ];
        idmap.set(n, id);
      }
    }
  })

  defineFunction("process_cwd", { deterministic: false }, function () {
    return process.cwd();
  });

  defineTable("readdir", {
    parameters: ["_path"],
    columns: ["type", "name"],
    rows: function* (path) {
      if (path == null) {
        path = process.cwd();
      }
      const entries = readdirSync(path, {
        encoding: "utf-8",
        withFileTypes: true,
      });
      for (const e of entries) {
        let type;
        if (e.isFIFO()) {
          type = "FIFO";
        } else if (e.isCharacterDevice()) {
          type = "CHR";
        } else if (e.isDirectory()) {
          type = "DIR"
        } else if (e.isBlockDevice()) {
          type = "BLK";
        } else if (e.isFile()) {
          type = "REG";
        } else if (e.isSymbolicLink()) {
          type = "LNK";
        } else if (e.isSocket()) {
          type = "SOCK";
        } else {
          type = "UNKNOWN";
        }
        yield [
          type,
          e.name,
        ]
      }
    }
  });

  defineTable("fs_stat", {
    parameters: ["_path"],
    columns: [
      "dev",
      "ino",
      "mode",
      "nlink",
      "uid",
      "gid",
      "rdev",
      "size",
      "blksize",
      "blocks",
      "atime_ms",
      "mtime_ms",
      "ctime_ms",
      "birthtime_ms",
      "atime_ns",
      "mtime_ns",
      "ctime_ns",
      "birthtime_ns",
      "atime",
      "mtime",
      "ctime",
      "birthtime",
    ],
    safeIntegers: true,
    rows: function* (path) {
      if (path == null) {
        return;
      }
      const {
        dev,
        ino,
        mode,
        nlink,
        uid,
        gid,
        rdev,
        size,
        blksize,
        blocks,
        atimeMs,
        mtimeMs,
        ctimeMs,
        birthtimeMs,
        atimeNs,
        mtimeNs,
        ctimeNs,
        birthtimeNs,
        atime,
        mtime,
        ctime,
        birthtime,
      } = statSync(path, {
        bigint: true,
      });
      yield [
        dev,
        ino,
        mode,
        nlink,
        uid,
        gid,
        rdev,
        size,
        blksize,
        blocks,
        atimeMs,
        mtimeMs,
        ctimeMs,
        birthtimeMs,
        atimeNs,
        mtimeNs,
        ctimeNs,
        birthtimeNs,
        atime.toISOString(),
        mtime.toISOString(),
        ctime.toISOString(),
        birthtime.toISOString(),
      ];
    }
  });

  defineFunction("readfile", { deterministic: false }, function (filename) {
    return readFileSync(filename);
  });

  defineFunction("readlink", { deterministic: false }, function (filename) {
    return readlinkSync(filename, "utf-8");
  });

  defineFunction("path_resolve", { deterministic: false, varargs: true }, pathResolve);

  defineFunction("basename", { deterministic: true }, function (p) {
    return basename(p);
  });

  defineFunction("basename", { deterministic: true }, function (p, ext) {
    return basename(p, ext);
  });

  defineFunction("dirname", { deterministic: true }, function (p) {
    return dirname(p);
  });

  defineFunction("json_hash", { deterministic: true }, function (json) {
    return memoizedJsonHash(JSON.parse(json));
  })

  defineFunction("json_hash", { deterministic: true }, function (json, algorithm) {
    return memoizedJsonHash(JSON.parse(json), { algorithm });
  })

  defineFunction("atob", { deterministic: true }, function (base64) {
    if (base64 == null) return null;
    if (typeof base64 !== "string") throw new TypeError("atob(base64) type of base64 must be text");
    return Buffer.from(base64, "base64");
  })

  defineFunction("btoa", { deterministic: true }, function (buffer) {
    if (buffer == null) return null;
    if (typeof buffer === "string") {
      buffer = Buffer.from(buffer, "utf-8")
    }
    if (!Buffer.isBuffer(buffer)) throw new TypeError("btoa(buffer) type of buffer must be text or blob");
    return buffer.toString("base64");
  })

  function bigintFlooredDivision(a, b) {
    // ECMAScript's / operator is defined by the quotient of truncated division.
    // This function defines the quotient of floored division.
    if (a < 0n) {
      return (a + 1n) / b - 1n;
    } else {
      return a / b;
    }
  }

  defineFunction("bin", { deterministic: true, safeIntegers: true }, function (value, size) {
    if (size == null || value == null) return null;
    if (typeof size !== "number" && typeof size !== "bigint") throw new TypeError("bin(value,size) size must be a number");
    if (typeof size === "number" || typeof value === "number") {
      const s = Number(size);
      return Math.floor(Number(value) / s) * s;
    } else if (typeof value === "bigint") {
      const s = size;
      return bigintFlooredDivision(value, s) * s;
    } else {
      throw new TypeError("bin(value,size) value must be a number or an integer");
    }
  })

  defineFunction("bin", { deterministic: true, safeIntegers: true }, function (value, size, offset) {
    if (size == null || value == null || offset == null) return null;
    if (typeof size !== "number" && typeof size !== "bigint") throw new TypeError("bin(value,size) size must be a number");
    if (typeof offset !== "number" && typeof offset !== "bigint") throw new TypeError("bin(value,size) offset must be a number");
    if (typeof size === "number" || typeof value === "number" || typeof offset === "number") {
      const s = Number(size);
      const o = Number(offset);
      return Math.floor((Number(value) - o) / s) * s + o;
    } else if (typeof value === "bigint") {
      const s = size;
      const o = offset;
      return bigintFlooredDivision(value - o, s) * s + o;
    } else {
      throw new TypeError("bin(value,size) value must be a number");
    }
  })

  defineTable("range", {
    parameters: ["_start", "_end", "_step"],
    columns: ["value"],
    safeIntegers: true,
    rows: function* (start, end, step) {
      if (start == null || end == null) {
        return;
      }
      if (typeof start === "bigint" && typeof end === "bigint" && (step == null || typeof step === "bigint")) {
        const st = step ?? 1n;
        if (st === 0n) {
          throw new Error("range(start,end,step) step must not be zero");
        }
        if (st < 0n) {
          for (let i = start; i >= end; i += st) {
            yield [i];
          }
        } else {
          for (let i = start; i <= end; i += st) {
            yield [i];
          }
        }
      } else {
        const s = Number(start);
        const e = Number(end);
        const st = Number(step ?? 1);
        for (let i = s; i <= e; i += st) {
          yield [i];
        }
      }
    }
  })

  defineTable("linear_space", {
    parameters: ["_start", "_end", "_num"],
    columns: ["value"],
    rows: function* (start, end, num) {
      if (start == null || end == null || num == null) {
        return;
      }
      const s = Number(start);
      const e = Number(end);
      const n = Math.floor(Number(num));
      if (n < 0) {
        throw new Error("linear_space(start,end,num) num must not be negative");
      }
      if (n === 0) {
        return;
      }
      if (n === 1) {
        yield [s];
        return;
      }
      const m = n - 1;
      for (let i = 0; i < n; ++i) {
        const r = i / m;
        const v = e * r + s * (1 - r);
        yield [v];
      }
    }
  })

  defineTable("topojson_feature", {
    parameters: ["_topology", "_object"],
    columns: ["id", "type", "properties", "geometry", "bbox"],
    rows: function* (topology, object) {
      if (topology == null || object == null) {
        return;
      }
      if (typeof object !== "string") {
        throw new TypeError("topojson_feature(topology,object) object must be a string");
      }
      if (Buffer.isBuffer(topology)) {
        topology = topology.toString("utf-8");
      }
      const t = JSON.parse(topology);
      const o = t.objects[object];
      if (o == null) {
        throw new Error(`topojson_feature(topology,object) object ${object} not found`);
      }
      const fs = feature(t, o);
      for (const f of fs.type === "Feature" ? [fs] : fs.features) {
        if (!(typeof f.id === "number" || typeof f.id === "string" || f.id == null)) {
          throw new Error("topojson_feature(topology,object) feature.id must be a number or a string");
        }
        yield [
          f.id,
          f.type,
          JSON.stringify(f.properties),
          JSON.stringify(f.geometry),
          f.bbox != null ? JSON.stringify(f.bbox) : null,
        ];
      }
    }
  })
}

async function parent() {
  /** @type {string[] | undefined} */
  let history;

  // ipc setups

  const child = fork(fileURLToPath(import.meta.url), process.argv.slice(2), {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });

  child.on("exit", (code, signal) => {
    if (isTTY && history) {
      saveHistory(history);
    }
    if (signal != null) {
      console.error(signal);
      process.exit(1);
    }
    process.exit(code);
  });

  let ipcCallId = 0;
  function ipcCall(method, params) {
    ++ipcCallId;
    const id = ipcCallId;
    return new Promise((resolve, reject) => {
      const callback = (message) => {
        if (message == null || typeof message !== "object") return;
        if (message.id !== id) return;
        if ("error" in message) {
          reject(message.error);
        } else {
          resolve(message.result);
        }
        child.off("message", callback);
      }
      child.on("message", callback);
      ipcSend(method, params, id);
    })
  }
  function ipcSend(method, params, id) {
    child.send({ method, params, id })
  }

  const readyPromise = new Promise((resolve) => {
    const callback = (message) => {
      if (message === "ready") {
        resolve();
        child.off("message", callback);
      }
    }
    child.on("message", callback);
  });

  /**
   * 
   * @param {{ command: string, args: any[] }} param0 
   * @returns {Promise<boolean>}
   */
  async function runCLICommand({ command, args }) {
    return ipcCall("runCLICommand", [{ command, args }]);
  }

  function runSqls(statements) {
    return ipcCall("runSqls", [statements]);
  }

  // signal setups

  function handleSignal(signal) {
    return function () {
      child.kill(signal);
    }
  }
  process.on("SIGINT", handleSignal("SIGINT"));
  process.on("SIGTERM", handleSignal("SIGTERM"));
  process.on("SIGQUIT", handleSignal("SIGQUIT"));

  // const syntax = readFileSync(fileURLToPath(new URL("../src/erq.pegjs", import.meta.url).href), "utf-8")
  // const parser = peggy.generate(syntax, {
  //   allowedStartRules: ["start", "cli_readline"],
  //   trace: DEBUG,
  // });

  // global states

  /** @type {"read" | "eval"} */
  let state = "read";
  let input = "";

  await readyPromise;

  if (options.format) {
    const ok = await runCLICommand({ command: "format", args: [options.format] });
    if (!ok) {
      ipcSend("quit", [1], null);
      return;
    }
  }

  for (const l of options.load) {
    const ok = await runCLICommand({ command: "load", args: [l] });
    if (!ok) {
      ipcSend("quit", [1], null);
      return;
    }
  }

  if (options.init) {
    input = readFileSync(options.init, "utf-8");
    input += "\n;;";
    while (input !== "") {
      const sqls = parseErq();
      if (sqls == null) {
        ipcSend("quit", [1], null);
        return;
      }
      const ok = await runSqls(sqls);
      if (!ok) {
        ipcSend("quit", [1], null);
        return;
      }
    }
  }

  function parseErq() {
    try {
      const sqls = parser.parse(input, { startRule: "cli_readline" });
      input = "";
      return sqls;
    } catch (error) {
      if (error.found === null) {
        return null;
      }
      if (DEBUG) {
        console.error(error);
      } else {
        console.error("%s: %s", error.name, error.message);
      }
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

  const historySize = process.env['ERQ_HISTORY_SIZE'] ? parseInt(process.env['ERQ_HISTORY_SIZE'], 10) : 1000;
  const rl = readline.createInterface({
    input: stdin,
    output: stderr,
    completer: (line, callback) => {
      ipcCall("completer", [line]).then(value => callback(null, value));
    },
    prompt: 'erq> ',
    history: loadHistory(),
    historySize,
  });

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
    } else if (state === "eval") {
      let ok = false;
      ipcCall("interrupt", []).then(() => ok = true);
      setTimeout(() => {
        if (!ok) {
          state = "hang";
        }
      }, 200);
    } else {
      child.kill("SIGKILL");
    }
  }
  rl.on("SIGINT", handleSigint);

  function handleSigtstp() {
    child.kill("SIGSTOP");
    rl.pause();
    process.once("SIGCONT", () => {
      child.kill("SIGCONT");
      stdin.setRawMode(true);
      if (state === "read" && isTTY) {
        // resume the stream
        rl.prompt();
      }
    });
    stdin.setRawMode(false);
    process.kill(process.pid, "SIGTSTP");
  }
  rl.on("SIGTSTP", handleSigtstp)

  if (isTTY) { rl.prompt(); }
  rl.on("line", async (line) => {
    if (input !== "") {
      input += "\n";
    }
    input += line;
    if (!isTTY) {
      // slurp all input before run
      return;
    }
    if (state === "read") {
      state = "eval";
      try {
        while (input !== "") {
          const sqls = parseErq();
          if (sqls == null) {
            break;
          }
          await runSqls(sqls);
        }
      } finally {
        state = "read";
      }
      setPrompt();
      if (isTTY) {
        rl.prompt();
      }
    }
  });

  rl.on("history", (h) => {
    history = h;
  });
  rl.on("close", async () => {
    if (input !== null) {
      input += "\n;;";
      const sqls = await parseErq();
      if (sqls == null) {
        ipcSend("quit", [1], null);
        return;
      }
      const ok = await runSqls(sqls);
      if (!ok) {
        ipcSend("quit", [1], null);
      } else {
        ipcSend("quit", [0], null);
      }
    }
  });
}

function child() {
  const patName = "[\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}][\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}\\p{Mc}\\p{Nd}\\p{Pc}\\p{Cf}]*"
  const patQuot = "(?<![\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}\\p{Mc}\\p{Nd}\\p{Pc}\\p{Cf}])`[^`]*`"
  const patPart = "(?<![\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}\\p{Mc}\\p{Nd}\\p{Pc}\\p{Cf}])`[^`]*"
  const reName = new RegExp(`^${patName}$`, "u");
  const reFQNamePart = new RegExp(`(?:(?:${patName}|${patQuot})\\.){0,2}(?:${patName}|${patQuot}|${patPart})?$`, "u");
  /**
   * Parse dot-separated name like `t.c` or `s.t.c`.
   * Used as `m = reParseColumnName.exec(q);`.
   * `m[1]`: schema or table name.
   * `m[2]`: table name if schema name is specified.
   * `m[3]`: column name.
   */
  const reParseColumnName = new RegExp(`^(${patName}|${patQuot})(?:\\.(${patName}|${patQuot}))?\\.(${patName}|${patQuot}|${patPart})?$`, "u");

  function quoteSQLName(name) {
    if (!reName.test(name)) {
      if (name.includes("\u0000")) {
        throw new RangeError("SQL name cannot contain NUL character");
      }
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

  function resolveTable(table, env) {
    if (Array.isArray(table)) {
      const [s, v] = table;
      const n = env.get(v.slice(1));
      if (n == null) {
        throw new Error(`variable ${v} not found`);
      }
      if (s != null) {
        return `${s}.${quoteSQLName(n)}`
      } else {
        return quoteSQLName(n);
      }
    }
    if (table[0] === "@") {
      const n = env.get(table.slice(1));
      if (n == null) {
        throw new Error(`variable ${v} not found`);
      }
      return quoteSQLName(n);
    }
    return table;
  }

  function preprocess(sourceSql, env) {
    const re = /\u0000(.)([^\u0000]*)\u0000/g
    return sourceSql.replace(re, (_, type, name) => {
      if (DEBUG) {
        console.error("preprocess %s %s", type, name);
      }
      if (type === "v") {
        return env.get(name.slice(1));
      } else if (type === "t") {
        const t = resolveTable(name, env);
        if (DEBUG) {
          console.error("resolved table %s", t);
        }
        return t;
      } else if (type === "e") {
        const stmt = db.prepare(name);
        return stmt.pluck().get(Object.fromEntries(env.entries()));
      } else {
        throw new Error(`unknown type: ${type}`);
      }
    });
  }

  const dbpath = options.db ?? ":memory:";
  const db = new Database(dbpath);
  console.error("Connected to %s", dbpath);

  // user functions

  function defineTable(
    /** @type {string} */ name,
    /** @type {import("better-sqlite3").VirtualTableOptions} */ options
  ) {
    db.table(name, options);
  }

  function defineFunction(
    /** @type {string} */ name,
    /** @type {Database.RegistrationOptions} */ options,
    /** @type {(...params: any[]) => any} */ func
  ) {
    db.function(name, options, func);
  }

  function defineAggregate(
    /** @type {string} */ name,
    /** @type {Database.AggregateOptions} */ options,
  ) {
    db.aggregate(name, options);
  }

  defineUserFunctions(defineFunction, defineTable, defineAggregate);

  /** @type {Map<string, (...args: any[]) => Promise<any>>} */
  const ipcExported = new Map();
  function ipcExport(methodFunc) {
    ipcExported.set(methodFunc.name, methodFunc);
  }
  /**
   * @param {string} method 
   * @param {any[]} params 
   * @returns {any}
   */
  async function callIpcMethod(method, params) {
    const methodFunc = ipcExported.get(method);
    if (methodFunc == null) {
      throw new Error(`method ${method} not found`)
    }
    const result = await methodFunc(...params);
    return result;
  }

  function getTables() {
    /** @type {{schema: string, name: string, type: string, ncol: number, wr: 0 | 1, strict: 0 | 1}[]} */
    const tables = db.prepare("pragma table_list").all();
    return tables;
  }

  function getAllModules() {
    /** @type {string[]} */
    const names = db.prepare("select name from pragma_module_list where name not glob 'pragma_*'").pluck().all();
    return names;
  }

  function getAllFunctionNames() {
    /** @type {string[]} */
    const names = db.prepare("select name from pragma_function_list").pluck().all();
    return names.map(name => quoteSQLName(name));
  }

  function getColumns(schema, table) {
    if (schema == null) {
      /** @type {{cid: number, name: string, type: string, notnull: 0 | 1, dflt_value: any, pk: 0 | 1, hidden: 0 | 1 | 2}[]} */
      const columns = db.prepare(`pragma table_xinfo(${quoteSQLName(table)})`).all();
      return columns;
    }
    /** @type {{cid: number, name: string, type: string, notnull: 0 | 1, dflt_value: any, pk: 0 | 1, hidden: 0 | 1 | 2}[]} */
    const columns = db.prepare(`pragma ${quoteSQLName(schema)}.table_xinfo(${quoteSQLName(table)})`).all();
    return columns;
  }

  function getPragmaNames() {
    /** @type {{name: string}[]} */
    const tables = db.prepare("pragma pragma_list").all();
    return tables.map(({ name }) => name);
  }

  async function completer(line) {
    const m = reFQNamePart.exec(line);
    const q = m[0];
    const qq = q.replace(/`/g, "");
    const isPragma = /pragma\s+\w*$/.test(line);
    if (isPragma) {
      return [getPragmaNames().filter(n => n.startsWith(q)), q];
    }
    try {
      const tables = getTables();
      const modules = getAllModules();
      const pragmas = getPragmaNames();
      const schemas = Array.from(new Set(tables.map(t => t.schema)).values(), s => quoteSQLName(s));
      const tableNamesFQ = tables.map(t => `${quoteSQLName(t.schema)}.${quoteSQLName(t.name)}`);
      const tableNames = tables.map(t => quoteSQLName(t.name)).concat(modules.map(m => quoteSQLName(m)));
      let _getAllColumnNames;
      const getAllColumnNames = () => {
        if (_getAllColumnNames) return _getAllColumnNames;
        return _getAllColumnNames = Array.from(new Set(tables.flatMap(t => {
          try {
            return getColumns(t.schema, t.name)
              .filter(c => c.hidden !== 1)
              .map(c => quoteSQLName(c.name));
          } catch {
            // If the view is invalid, getColumn throws an SqliteError.
            // Ignore it.
            return [];
          }
        })).values());
      }
      // column completion
      {
        const m = reParseColumnName.exec(q);
        if (m != null) {
          const m1 = unquoteSQLName(m[1]);
          const m2 = m[2] && unquoteSQLName(m[2]);
          const m3 = m[3] ? unquoteSQLName(m[3]) : "";
          // set sn as the schema name and tn as the table name.
          const [sn, tn, cn] = (m2 != null) ? [m1, m2, m3] : [tables.find(t => t.name === m1)?.schema, m1, m3];
          if (schemas.includes(sn)) {
            const columns = getColumns(sn, tn).filter(c => c.hidden !== 1 && c.name.startsWith(cn));
            if (m2 != null) {
              const qtn = `${quoteSQLName(sn)}.${quoteSQLName(tn)}`;
              return [columns.map(c => `${qtn}.${quoteSQLName(c.name)}`), q];
            } else {
              const qtn = quoteSQLName(tn);
              return [columns.map(c => `${qtn}.${quoteSQLName(c.name)}`), q];
            }
          } else if (schemas.includes(tn)) {
            const ts = tables
              .filter(t => t.schema === tn)
              .map(t => quoteSQLName(t.name))
              .filter(name => name.startsWith(cn))
              .map(name => `${quoteSQLName(tn)}.${name}`);
            if (ts.length > 0) {
              return [ts, q];
            }
          } else if (modules.includes(tn)) {
            const columns = getColumns(null, tn).filter(c => c.hidden !== 1 && c.name.startsWith(cn));
            return [columns.map(c => `${tn}.${quoteSQLName(c.name)}`), q];
          } else if (tn.startsWith("pragma_") && pragmas.includes(tn.slice("pragma_".length))) {
            const columns = getColumns(null, tn).filter(c => c.hidden !== 1 && c.name.startsWith(cn));
            return [columns.map(c => `${tn}.${quoteSQLName(c.name)}`), q];
          } else {
            const cs = getAllColumnNames().filter(name => name.startsWith(cn));
            if (cs.length > 0) {
              return [cs, q.replace(/^.*\./, "")];
            }
          }
        }
      }
      // other name completion
      {
        const columnNames = getAllColumnNames();
        const functionNames = getAllFunctionNames();
        const matches
          = Array.from(new Set([
            ...schemas,
            ...tableNames,
            ...tableNamesFQ,
            ...modules,
            ...columnNames,
            ...functionNames,
            ...pragmas.map(p => `pragma_${p}`)]).values())
            .filter(n => {
              return n.replace(/`/g, "").startsWith(qq);
            })
            .sort();
        if (matches.length > 0) {
          return [matches, q];
        }
      }
    } catch (error) {
      // ignore errorsu   
      console.error(error);
    }
    return [[], q];
  }
  ipcExport(completer);

  let sigint = false;
  async function interrupt() {
    sigint = true;
  }
  ipcExport(interrupt);

  // global state

  /** @type {"dense" | "sparse"} */
  let outputFormat = "dense";
  let outputStream = stdout;

  /**
   * 
   * @param {string[]} header 
   * @param {unknown} json 
   */
  function convertJsonToRecord(header, json) {
    if (json == null || typeof json !== "object") {
      json = { value: json };
    }
    return header.map(n => {
      const v = json[n];
      if (v == null) return null;
      if (v === true) return 1;
      if (v === false) return 0;
      if (typeof v === "object") return JSON.stringify(v);
      return v;
    })
  }

  /**
   * 
   * @param {import("better-sqlite3").Database} db 
   * @param {() => Promise<void>} fn 
   */
  async function asyncTransaction(db, fn) {
    if (db.inTransaction) {
      await fn();
      return;
    } else {
      db.prepare("begin").run();
      try {
        await fn();
        db.prepare("commit").run();
      } catch (error) {
        db.prepare("rollback").run();
        throw error;
      }
    }
  }

  /**
   * @param {{command: string, args: any[]}} param0
   * @param {Map<string, any>} env
   * @returns {Promise<boolean>} ok status
   */
  async function runCLICommand({ command, args }, env) {
    try {
      return await runCLICommandThrowing({ command, args }, env);
    } catch (error) {
      if (DEBUG) {
        console.error(error);
      } else {
        console.error("%s: %s", error.name, error.message);
      }
      return false;
    }
  }
  ipcExport(runCLICommand);

  /**
   * @param {{command: string, args: any[]}} param0
   * @param {Map<string, any>} env
   * @returns {Promise<boolean>} ok status
   */
  async function runCLICommandThrowing({ command, args }, env) {
    function tableExists(table) {
      return db.prepare(`select exists (select * from sqlite_master where name = ?)`)
        .pluck()
        .get(unquoteSQLName(table));
    }
    const vars = Object.fromEntries(env.entries());
    if (command === "load") {
      if (args.length === 1) {
        db.loadExtension(args[0]);
        return true;
      } else {
        console.error("usage: .load PATH");
        return false;
      }
    }
    else if (command === "cd") {
      if (args.length === 1) {
        process.chdir(args[0]);
        return true;
      } else {
        console.error("usage: .cd PATH");
        return false;
      }
    }
    else if (command === "format") {
      if (args.length === 1) {
        if (args[0] === "array") {
          outputFormat = "dense";
          return true;
        } else if (args[0] === "object") {
          outputFormat = "sparse";
          return true;
        }
      }
      console.error("usage: .format MODE");
      console.error("  MODE is one of:");
      console.error("    array\tResults in ndjson (each record is an JSON array)");
      console.error("    object\tResults in ndjson (each record is an JSON object)");
      return false;
    } else if (command === "meta-set-output") {
      outputFormat = args[0];
      return true;
    }
    else if (command === "meta-load") {
      const t0 = performance.now();
      const { ifNotExists, def, columns: columnNames, contentType, options } = args;
      const table = resolveTable(args.table, env);
      if (ifNotExists && tableExists(table)) {
        return true;
      }
      let path = args.path
      if (args.variable != null) {
        path ??= env.get(args.variable.slice(1));
      }
      const nullValue = options.nullValue ?? "";
      const delimiter = options.delimiter ?? ",";
      const quote = options.quote ?? '"';
      const escape = options.escape ?? quote;
      const comment = options.comment ?? undefined;
      const format = options.format ?? contentType;
      const relax_column_count = options.relax_column_count ?? undefined;;
      const relax_column_count_less = options.relax_column_count_less ?? undefined;;
      const relax_column_count_more = options.relax_column_count_more ?? undefined;;
      const encoding = options.encoding ?? "utf-8";
      const sniff_size = options.sniff_size ?? Number.POSITIVE_INFINITY;
      let content = args.content;
      if (args.sql != null) {
        content = db.prepare(args.sql).pluck().get();
      }
      if (format === "csv") {
        const stream = path != null ? createReadStream(path).pipe(iconv.decodeStream(encoding)) : Readable.from(content);
        const csv = stream.pipe(parseCSV({
          bom: true,
          delimiter,
          quote,
          escape,
          comment,
          relax_column_count,
          relax_column_count_less,
          relax_column_count_more,
          cast: (value, context) => {
            if (value === nullValue && !context.quoting) {
              return null;
            }
            return value;
          },
        }));
        /** @type {AsyncIterable<any[]>} */
        let records
        let header, definition;
        if (def) {
          header = columnNames;
          definition = def;
          records = options.header ? (await uncons(csv))[1] : csv;
        } else {
          [header, records] = await uncons(csv);
          if (header != null) {
            definition = header.map(f => `\`${f.replace(/`/g, "``")}\``).join(", ");
          }
        }
        if (definition == null) {
          console.error("header is not defined");
          return false;
        }
        await asyncTransaction(db, async () => {
          const createTableSQL = `create table ${table} (${definition})`;
          console.error(createTableSQL);
          db.prepare(createTableSQL).run();
          const insertSQL = `insert into ${table} values (${header.map(f => "?").join(", ")})`;
          console.error(insertSQL);
          const insert = db.prepare(insertSQL);
          let i = 0;
          const insertMany = async () => {
            for await (const record of records) {
              i++;
              if (record.length === header.length) {
                insert.run(record);
              } else if ((relax_column_count_less || relax_column_count) && record.length < header.length) {
                insert.run(record.concat(...Array(header.length - record.length)));
              } else if ((relax_column_count_more || relax_column_count) && record.length > header.length) {
                insert.run(record.slice(0, header.length));
              } else {
                throw new Error(`the row #${i} has ${record.length} fields, not matching number of columns ${header.length}`);
              }
            }
          };
          await insertMany();
          const t1 = performance.now();
          const t = t1 - t0;
          const rows = (i === 1) ? "1 row" : `${i} rows`;
          console.error("%s inserted (%ss)", rows, (t / 1000).toFixed(3));
        });
        return true;
      } else if (format === "ndjson") {
        let stream = path != null ? createReadStream(path).pipe(iconv.decodeStream(encoding)) : Readable.from(content);
        let records = stream.pipe(ndjson.parse());
        let header, definition;
        if (def) {
          header = columnNames;
          definition = def;
        } else {
          // sniff column names
          const s = new Set();
          let i = 0;
          for await (const record of records) {
            if (record == null || typeof record !== "object") {
              s.add("value");
            }
            for (const key of Object.keys(record)) {
              s.add(key);
            }
            i++;
            if (i >= sniff_size) {
              break;
            }
          }
          header = Array.from(s);
          definition = header.map(f => `\`${f.replace(/`/g, "``")}\``).join(", ");
          stream = path != null ? createReadStream(path).pipe(iconv.decodeStream(encoding)) : Readable.from(content);
          records = stream.pipe(ndjson.parse());
        }
        await asyncTransaction(db, async () => {
          const createTableSQL = `create table ${table} (${definition})`;
          console.error(createTableSQL);
          db.prepare(createTableSQL).run();
          const insertSQL = `insert into ${table} values (${header.map(f => "?").join(", ")})`;
          console.error(insertSQL);
          const insert = db.prepare(insertSQL);
          let i = 0;
          const insertMany = async () => {
            for await (let json of records) {
              i++;
              insert.run(convertJsonToRecord(header, json))
            }
          };
          await insertMany();
          const t1 = performance.now();
          const t = t1 - t0;
          const rows = (i === 1) ? "1 row" : `${i} rows`;
          console.error("%s inserted (%ss)", rows, (t / 1000).toFixed(3));
        });
        return true;
      } else {
        console.error("unknown content type: %s", contentType);
        return false;
      }
    }
    else if (command === "meta-create-function") {
      const [fn, ps, { rawblock: [tag, body] }] = args;
      if (tag === "js" || tag === "javascript") {
        const vm = new NodeVM({
          console: 'inherit',
          sandbox: {},
          require: {
            external: true,
            builtin: [],
          },
          strict: true,
        });
        const f = vm.run(`module.exports = function(${ps.join(",")}) {\n${body}\n};`);
        db.function(fn, f);
        console.error("ok");
        return true;
      }
      else {
        console.error("unknown language: %s", tag);
        return false;
      }
    }
    else if (command === "meta-create-table-from-json") {
      const t0 = performance.now();
      const [tableWithVariable, def, jsonsqlSource, ifNotExists] = args;
      const jsonsql = jsonsqlSource && preprocess(jsonsqlSource, env);
      if (DEBUG) {
        console.error(jsonsql);
      }
      const table = resolveTable(tableWithVariable, env);
      if (ifNotExists && tableExists(table)) {
        return true;
      }
      const columnNames = def && def.columns.filter(c => !c.constraints.some(({ body }) => body.startsWith("as"))).map(c => c.name);
      let header, definition;
      if (def) {
        header = columnNames;
        definition = def;
      } else {
        const keys = db.prepare(`with t(v) as (${jsonsql}) `
          + `select distinct key from `
          + `(select ifnull(k.key, 'value') as key from t join json_each(t.v) as u join json_each(u.value) as k `
          + `where json_type(t.v) = 'array' `
          + `union all select ifnull(k.key, 'value') from t join json_each(t.v) as k `
          + `where json_type(t.v) <> 'array')`).pluck().all(vars);
        header = keys.map(String);
        definition = header.map(f => `\`${f.replace(/`/g, "``")}\``).join(", ");
      }
      const createTableSQL = `create table ${table} (${definition})`;
      console.error(createTableSQL);
      db.prepare(createTableSQL).run();
      const insertSQL = `insert into ${table} values (${header.map(f => "?").join(", ")})`;
      console.error(insertSQL);
      const insert = db.prepare(insertSQL);
      const records = db.prepare(jsonsql).pluck().all(vars);
      let ct = 0
      const insertMany = db.transaction(() => {
        for (let json of records) {
          const obj = JSON.parse(json)
          if (Array.isArray(obj)) {
            for (const o of obj) {
              insert.run(convertJsonToRecord(header, o))
              ct++;
            }
          } else {
            insert.run(convertJsonToRecord(header, obj))
            ct++;
          }
        }
      });
      insertMany();
      const t1 = performance.now();
      const t = t1 - t0;
      const rows = (ct === 1) ? "1 row" : `${ct} rows`;
      console.error("%s inserted (%ss)", rows, (t / 1000).toFixed(3));
      return true;
    }
    else {
      console.error("unknown command: %s args: %s", command, JSON.stringify(args));
      return false;
    }
  }

  async function runSqls(statements, env = new Map()) {
    try {
      for (const statement of statements) {
        if (statement.type === "command") {
          const ok = await runCLICommand(statement, env);
          if (!ok) return false;
          continue;
        }
        if (statement.type === "for") {
          const {
            assignments,
            sourceTable,
            bodyStatements,
          } = statement
          const sourceSql = `select ${assignments.map(({ name, expression }) => {
            if (expression == null) return name;
            return `${expression} as ${name}`
          }).join(", ")} from (${preprocess(sourceTable, env)})`
          console.error(sourceSql);
          const t0 = performance.now();
          const stmt = db.prepare(sourceSql);
          const env2 = new Map(env.entries());
          const t1 = performance.now();
          const records = stmt.all(Object.fromEntries(env.entries()));
          const t = t1 - t0;
          const i = records.length;
          const rows = (i === 1) ? "1 row" : `${i} rows`;
          console.error("%s loaded (%ss)", rows, (t / 1000).toFixed(3));
          for (const row of records) {
            for (const { variable } of assignments) {
              const v = variable.slice(1);
              env2.set(v, row[v]);
            }
            const ok = await runSqls(bodyStatements, env2);
            if (!ok) return false;
          }
          continue;
        }
        const {
          type,
          query: sourceSql,
          returning,
          format = outputFormat,
        } = statement;
        if (sigint) {
          break;
        }
        const sql = preprocess(sourceSql, env);
        console.error(sql);
        const t0 = performance.now();
        const stmt = db.prepare(sql);
        if (typeof format === "object" && format.type === "vega") {
          stmt.raw(false);
          const t0 = performance.now();
          const values = stmt.all(Object.fromEntries(env.entries())).map(record => {
            // SQLite can't return JSON object directly, so it returns JSON string.
            // try parsing JSON string. if failed, ignore error and return the original value.
            // TODO: Add option to disable this behavior.
            for (const key in record) {
              try {
                const value = record[key];
                if (typeof value === "string" && (
                  value === "{}" ||
                  value[0] === "{" && value[1] === '"' && value[value.length - 1] === "}" ||
                  value[0] === "[" && value[value.length - 1] === "]"
                )) {
                  record[key] = JSON.parse(value);
                }
              } catch {
                // ignore error
              }
            }
            return record;
          });
          const t1 = performance.now();
          const t = t1 - t0;
          const i = values.length;
          const rows = (i === 1) ? "1 row" : `${i} rows`;
          console.error("%s loaded (%ss)", rows, (t / 1000).toFixed(3));
          const spec = { ...format.view, data: { values } };
          if (format.format === "spec") {
            if (!outputStream.write(JSON.stringify(spec))) {
              await new Promise(resolve => outputStream.once("drain", () => resolve()));
            }
            if (!outputStream.write("\n")) {
              await new Promise(resolve => outputStream.once("drain", () => resolve()));
            }
            continue;
          }
          const vgSpec = vegaLite.compile(spec).spec;
          const vgView = new vega.View(vega.parse(vgSpec), {
            logger: vega.logger(vega.Warn, 'error'),
            renderer: 'none',
          }).finalize();
          if (format.format === "svg") {
            const svg = await vgView.toSVG();
            if (!outputStream.write(svg)) {
              await new Promise(resolve => outputStream.once("drain", () => resolve()));
            }
            if (!outputStream.write("\n")) {
              await new Promise(resolve => outputStream.once("drain", () => resolve()));
            }
            continue;
          }
          const canvas = await vgView.toCanvas();
          const png = canvas.toBuffer();
          const size = png.length;
          if (!outputStream.write(`\x1b]1337;File=inline=1;size=${size}:`)) {
            await new Promise(resolve => outputStream.once("drain", () => resolve()));
          }
          if (!outputStream.write(png.toString("base64"))) {
            await new Promise(resolve => outputStream.once("drain", () => resolve()));
          }
          if (!outputStream.write('\x07\n')) {
            await new Promise(resolve => outputStream.once("drain", () => resolve()));
          }
          continue;
        }
        if (type === "select" || type === "pragma" || returning) {
          stmt.raw(true);
          // stmt.safeIntegers(true);
          const columns = stmt.columns();
          const columnNames = columns.map(c => c.name);
          if (format !== "eqp") {
            console.error(JSON.stringify(columnNames));
          }
          if (format === "eqp") {
            console.log("* QUERY PLAN")
          }
          let interrupted = false;
          let i = 0;

          /**
           * @returns {(r: any[], outputStream: NodeJS.WriteStream) => Promise<void>}
           */
          const createFormatter = (format) => {
            if (format === "sparse") return async (r, outputStream) => {
              const kvs = r.map((value, j) => {
                const k = columnNames[j];
                if (value != null && typeof value === "object") {
                  // convert Buffer object to Array object
                  return [k, Array.from(value)];
                }
                if (typeof value === "bigint") {
                  return [k, String(value)];
                }
                return [k, value];
              });
              const obj = Object.fromEntries(kvs.filter(([k, v]) => v !== null));
              if (!outputStream.write(JSON.stringify(obj) + "\n")) {
                await new Promise(resolve => outputStream.once("drain", () => resolve()));
              }
            }
            if (format === "eqp") return createEqpFormatter();
            if (format === "raw") return async (r, outputStream) => {
              for (const v of r) {
                if (v == null) {
                  continue;
                } else if (typeof v === "object") {
                  // write raw buffer
                  if (!outputStream.write(v)) {
                    await new Promise(resolve => outputStream.once("drain", () => resolve()));
                  }
                } else {
                  if (!outputStream.write(String(v))) {
                    await new Promise(resolve => outputStream.once("drain", () => resolve()));
                  }
                }
              }
            }
            return async (r, outputStream) => {
              // default dense format
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
              }
            }
          }

          const formatter = createFormatter(format);

          for (const r of stmt.iterate(Object.fromEntries(env.entries()))) {
            i++;
            await formatter(r, outputStream);
            if (i % 100 === 0) {
              await new Promise(resolve => setImmediate(() => resolve()));
            }
            if (sigint) {
              console.error("Interrupted");
              interrupted = true;
              break;
            }
          }

          const t1 = performance.now();
          const t = t1 - t0;
          const rows = (i === 1) ? "1 row" : `${i} rows`;
          console.error("%s (%ss)", rows, (t / 1000).toFixed(3));
          if (interrupted) return false;
        } else {
          const { changes, lastInsertRowid } = stmt.run(Object.fromEntries(env.entries()));
          const t1 = performance.now();
          const t = t1 - t0;
          const rows = (changes === 1) ? "1 row" : `${changes} rows`;
          if (type === "insert") {
            console.error("%s changed, lastInsertRowid=%s (%ss)", rows, lastInsertRowid, (t / 1000).toFixed(3));
          } else if (type === "update" || type === "delete") {
            console.error("%s changed (%ss)", rows, (t / 1000).toFixed(3));
          } else {
            console.error("ok (%ss)", (t / 1000).toFixed(3));
          }
        }
      }
    } catch (error) {
      console.error("%s: %s", error.name, error.message);
      return false;
    } finally {
      sigint = false;
    }
    return true;
  }
  ipcExport(runSqls);

  async function quit(status) {
    db.close();
    process.exit(status);
  }
  ipcExport(quit);

  process.on("message", async (message) => {
    if (message == null || typeof message !== "object") return;
    try {
      const { method, params, id } = message;
      try {
        const result = await callIpcMethod(method, params);
        if (id != null) {
          process.send({ result, id });
        }
      } catch (error) {
        console.error(error);
        process.send({
          error: { code: 1, message: String(error), data: {} },
          id,
        });
      }
    } catch (error) {
      console.error(error);
      process.send({
        error: { code: 2, message: String(error), data: {} },
        id: null,
      });
    }
  })

  process.send("ready");
}

/**
 * Format EXPLAIN QUERY PLAN output.
 * @returns 
 */
function createEqpFormatter() {
  const nodes = [];
  return async ([id, parent, _notused, detail], outputStream) => {
    while (nodes.length > 0 && nodes[nodes.length - 1] !== parent) {
      nodes.pop()
    }
    nodes.push(id);
    let s = ""
    for (let i = 0; i < nodes.length; i++) {
      s += "   "
    }
    return outputStream.write(s + "* " + detail + "\n");
  }
}

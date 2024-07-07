import { readFileSync, readdirSync, readlinkSync, statSync, lstatSync, symlinkSync, mkdirSync } from "node:fs";
import { resolve as pathResolve, basename, dirname, join as pathJoin, relative as pathRelative } from "node:path";
import { createHash } from "node:crypto";
import memoizedJsonHash from "@mandel59/memoized-json-hash";
import { serialize, deserialize } from "@ungap/structured-clone";

import { createErqNodeJsModule } from "../create-erq-nodejs-module.js";

export default createErqNodeJsModule('global', async ({ registerModule, defineTable, defineFunction, defineAggregate }) => {

  registerModule("dom", () => import("./dom.js"));
  registerModule("geo", () => import("./geo.js"));
  registerModule("iconv", () => import("./iconv.js"));

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
    return enumDefs[Number(BigInt(value) - 1n)] ?? null;
  });

  defineFunction("regexp", { deterministic: true }, function (pattern, string) {
    if (pattern == null || string == null) {
      return null;
    }
    return Number(new RegExp(pattern, "gu").test(string));
  });

  defineFunction("regexp_replace", { deterministic: true }, function (source_string, pattern, replace_string) {
    if (source_string == null || pattern == null || replace_string == null) {
      return null;
    }
    return String(source_string).replace(new RegExp(pattern, "gu"), replace_string);
  });

  defineFunction("regexp_substr", { deterministic: true }, function (string, pattern) {
    if (string == null || pattern == null) {
      return null;
    }
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
      if (string == null || pattern == null) {
        return;
      }
      const re = new RegExp(pattern, "gu");
      let m, prev;
      while (m = re.exec(string)) {
        if (m.index === prev) {
          re.lastIndex++;
          continue;
        }
        yield [m[0]];
        prev = m.index;
      }
    }
  });

  defineFunction("regexp_group", { deterministic: true }, function (string, pattern) {
    if (string == null || pattern == null) {
      return null;
    }
    const re = new RegExp(pattern, "u");
    const m = re.exec(string);
    if (m) {
      if (m.groups) {
        return JSON.stringify(m.groups);
      } else {
        return JSON.stringify(m.slice(1));
      }
    }
    return null;
  });

  defineTable("regexp_all", {
    parameters: ["_string", "_pattern"],
    columns: ["substr", "groups"],
    rows: function* (
      /** @type {string} */ string,
      /** @type {string} */ pattern) {
      if (string == null || pattern == null) {
        return;
      }
      const re = new RegExp(pattern, "gu");
      let m, prev;
      while (m = re.exec(string)) {
        if (m.index === prev) {
          re.lastIndex++;
          continue;
        }
        const substr = m[0];
        if (m.groups) {
          yield [substr, JSON.stringify(m.groups)];
        } else {
          yield [substr, JSON.stringify(m.slice(1))];
        }
        prev = m.index;
      }
    }
  });

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

  defineTable("fs_find", {
    parameters: ["_path"],
    columns: [
      "type",
      "dir",
      "name",
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
    rows: function* find(dir) {
      if (dir == null) {
        dir = ".";
      }
      const entries = readdirSync(dir, {
        encoding: "utf-8",
        withFileTypes: true,
      });
      for (const e of entries) {
        let type;
        const name = e.name;
        const filePath = pathJoin(dir, name)
        const stats = lstatSync(filePath, {
          bigint: true,
        });
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
        } = stats
        if (stats.isFile()) {
          type = "REG";
        } else if (stats.isDirectory()) {
          type = "DIR";
        } else if (stats.isSymbolicLink()) {
          type = "LNK";
        } else if (stats.isFIFO()) {
          type = "FIFO";
        } else if (stats.isCharacterDevice()) {
          type = "CHR";
        } else if (stats.isBlockDevice()) {
          type = "BLK";
        } else if (stats.isSocket()) {
          type = "SOCK";
        } else {
          type = "UNKNOWN";
        }
        yield [
          type,
          dir,
          name,
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
        if (type === "DIR") {
          yield* find(filePath);
        }
      }
    }
  });

  defineFunction("readfile", { deterministic: false }, function (filename) {
    try {
      return readFileSync(filename);
    } catch (e) {
      if (e?.code === 'ENOENT') {
        return null
      }
      throw e
    }
  });

  defineFunction("readlink", { deterministic: false }, function (filename) {
    return readlinkSync(filename, "utf-8");
  });

  defineFunction("symlink", { deterministic: false, directOnly: true }, function (target, path) {
    if (target == null || path == null) return null;
    mkdirSync(dirname(path), { recursive: true });
    try {
      symlinkSync(target, path);
      return 1n;
    } catch (e) {
      if (e?.code === 'EEXIST') {
        try {
          const link = readlinkSync(path, { encoding: 'buffer' })
          if (Buffer.compare(Buffer.from(target), link) === 0) {
            return 0n;
          }
        } catch { }
      }
      throw e
    }
  })

  defineFunction("path_resolve", { deterministic: false, varargs: true }, pathResolve);

  defineFunction("path_join", { deterministic: false, varargs: true }, pathJoin);

  defineFunction("path_relative", { deterministic: false }, function (from, to) {
    if (from == null || to == null) return null;
    return pathRelative(from, to);
  })

  defineFunction("basename", { deterministic: true }, function (p) {
    if (p == null) return null;
    return basename(p);
  });

  defineFunction("basename", { deterministic: true }, function (p, ext) {
    if (p == null || ext == null) return null;
    return basename(p, ext);
  });

  defineFunction("dirname", { deterministic: true }, function (p) {
    if (p == null) return null;
    return dirname(p);
  });

  defineFunction("json_hash", { deterministic: true }, function (json) {
    if (json == null) return null
    return memoizedJsonHash(JSON.parse(json));
  })

  defineFunction("json_hash", { deterministic: true }, function (json, algorithm) {
    if (json == null || algorithm == null) return null
    return memoizedJsonHash(JSON.parse(json), { algorithm });
  })

  defineFunction("json_serialize", { safeIntegers: true }, function (value) {
    if (value == null) return null
    return JSON.stringify(serialize(JSON.parse(value)));
  })

  defineFunction("structured_serialize", { safeIntegers: true }, function (value) {
    return JSON.stringify(serialize(value));
  })

  defineFunction("serialize_values", { varargs: true, safeIntegers: true }, function (...args) {
    return JSON.stringify(serialize(args));
  })

  defineAggregate("serialize_group_values", {
    safeIntegers: true,
    start: () => [],
    step: (array, next) => {
      array.push(next);
    },
    inverse: (array, _dropped) => {
      array.shift();
    },
    result: (array) => {
      return JSON.stringify(serialize(array));
    },
  })

  /**
   * 
   * @param {*} jsvalue 
   * @returns {[string, any]}
   */
  function jsValueToSqliteRow(jsvalue) {
    if (jsvalue === undefined) {
      return ['undefined', null];
    }
    if (jsvalue === null) {
      return ['null', null];
    }
    if (typeof jsvalue === "bigint") {
      if (jsvalue > BigInt(Number.MAX_SAFE_INTEGER) || jsvalue < BigInt(Number.MIN_SAFE_INTEGER)) {
        return ['bigint', jsvalue];
      } else {
        return ['bigint', jsvalue];
      }
    }
    if (typeof jsvalue === "boolean") {
      return ['boolean', jsvalue ? 1 : 0];
    }
    if (typeof jsvalue === "number") {
      return ['number', jsvalue];
    }
    if (typeof jsvalue === "string") {
      return ['string', jsvalue];
    }
    const c = Object.getPrototypeOf(jsvalue)?.constructor?.name;
    switch (c) {
      case "Date":
        return ['Date', jsvalue.toISOString().replace("T", " ").replace("Z", "")];
      case "Uint8Array":
        return ['Uint8Array', jsvalue];
      case "Object":
        return ['Object', `{${String(Object.keys(jsvalue))}}`];
      case "Array":
        return ['Array', `[${String(jsvalue)}]`];
      default:
        return [c, String(jsvalue)];
    }
  }

  defineFunction("structured_deserialize", { varargs: true }, function (json, ...path) {
    if (json == null) return null;
    if (typeof json !== "string") throw new TypeError("deserialize(json) json must be text");
    let value = deserialize(JSON.parse(json));
    for (const p of path) {
      if (value == null) return null;
      if (typeof value !== "object") return null;
      switch (Object.getPrototypeOf(value)?.constructor?.name) {
        case "Map":
          value = value.get(p);
          break;
        case "Set":
          value = value.has(p);
          break;
        case "Array":
          value = value[p];
          break;
        case "Object":
          value = value[p];
          break;
        default:
          value = null;
      }
    }
    return jsValueToSqliteRow(value)[1];
  })

  defineTable("deserialize_values", {
    safeIntegers: true,
    parameters: ["_json"],
    columns: ["value"],
    rows: function* (json) {
      if (json == null) return;
      if (typeof json !== "string") throw new TypeError("deserialize_values(json) json must be text");
      const values = deserialize(JSON.parse(json));
      if (Array.isArray(values)) {
        for (const value of values) {
          yield [jsValueToSqliteRow(value)[1]];
        }
      } else {
        yield [jsValueToSqliteRow(values)[1]];
      }
    }
  })

  defineTable("deserialize_values_with_type", {
    safeIntegers: true,
    parameters: ["_json"],
    columns: ["type", "value"],
    rows: function* (json) {
      if (json == null) return;
      if (typeof json !== "string") throw new TypeError("deserialize_values_with_type(json) json must be text");
      const values = deserialize(JSON.parse(json));
      if (Array.isArray(values)) {
        for (const value of values) {
          yield jsValueToSqliteRow(value);
        }
      } else {
        yield jsValueToSqliteRow(values);
      }
    }
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

  /**
   * The quotient of floored division.
   * @param {bigint} a
   * @param {bigint} b
   * @returns {bigint}
   */
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

  defineFunction("normalize", { deterministic: true }, function (str) {
    if (str == null) return null;
    if (typeof str !== "string") throw new TypeError("normalize(str,form) str must be a string");
    return str.normalize();
  })

  defineFunction("normalize", { deterministic: true }, function (str, form) {
    if (str == null) return null;
    if (form == null) return null;
    if (typeof str !== "string") throw new TypeError("normalize(str,form) str must be a string");
    if (typeof form !== "string") throw new TypeError("normalize(str,form) form must be a string");
    return str.normalize(form);
  })

  defineFunction("console_error", { deterministic: false, varargs: true }, function (message, ...args) {
    console.error(message, ...args)
    return args[0] ?? null
  })

  defineFunction("sha256", { deterministic: true }, function(blob) {
    const hash = createHash("sha256")
    hash.update(blob)
    return hash.digest()
  })

  defineFunction("sha1", { deterministic: true }, function(blob) {
    const hash = createHash("sha1")
    hash.update(blob)
    return hash.digest()
  })

  defineFunction("md5", { deterministic: true }, function(blob) {
    const hash = createHash("md5")
    hash.update(blob)
    return hash.digest()
  })
});

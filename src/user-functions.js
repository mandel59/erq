import { readFileSync, readdirSync, readlinkSync, statSync } from "node:fs";
import { resolve as pathResolve, basename, dirname } from "node:path";
import jsdom from "jsdom";
import memoizedJsonHash from "@mandel59/memoized-json-hash";
import { feature } from "topojson-client";
import iconv from "iconv-lite";
import { geomToGeoJSON } from "./geo/geom-to-geojson.js";
import { serialize, deserialize } from "@ungap/structured-clone";

/**
 * @param {(name: string, options: import("better-sqlite3").RegistrationOptions, func: (...params: any[]) => any) => void} defineFunction 
 * @param {(name: string, options: Parameters<import("better-sqlite3").Database["table"]>[1]) => void} defineTable 
 * @param {(name: string, options: Parameters<import("better-sqlite3").Database["aggregate"]>[1]) => void} defineAggregate
 */
export function defineUserFunctions(defineFunction, defineTable, defineAggregate) {
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
      /**
       * @param {string} contentType 
       * @returns {contentType is 'text/html' | 'application/xhtml+xml' | 'application/xml' | 'text/xml' | 'image/svg+xml'}
       */
      function isSupportedContentType(contentType) {
        return contentType === "text/html"
          || contentType === "application/xhtml+xml"
          || contentType === "application/xml"
          || contentType === "text/xml"
          || contentType === "image/svg+xml";
      }
      if (xml == null) {
        return;
      }
      if (contentType == null) {
        contentType = "application/xml";
      }
      if (!isSupportedContentType(contentType)) {
        throw new Error(`xml_tree(xml,contentType,url,referrer) unsupported content type ${contentType}`);
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

  defineFunction("serialize_values", { deterministic: true, varargs: true, safeIntegers: true }, function (...args) {
    return JSON.stringify(serialize(args));
  })

  defineAggregate("serialize_group_values", {
    safeIntegers: true,
    start: () => [],
    step: (/** @type {any[]} */ array, /** @type {any} */ next) => {
      array.push(next);
    },
    inverse: (/** @type {any[]} */ array, /** @type {any} */ _dropped) => {
      array.shift();
    },
    result: (/** @type {any[]} */ array) => {
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
      default:
        return [c, String(jsvalue)];
    }
  }

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
      /** @type {*} */
      const f = feature(t, o);
      /** @type {Array<import("geojson").Feature>} */
      let fs;
      /**
       * @param {*} obj
       * @returns {obj is import("geojson").FeatureCollection}
       */
      function isFeatureCollection(obj) {
        return obj.type === "FeatureCollection";
      }
      if (isFeatureCollection(f)) {
        fs = f.features;
      } else {
        fs = [f];
      }
      for (const f of fs) {
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

  defineTable("gpkg_wkb_feature", {
    parameters: ["_geom"],
    columns: ["type", "geometry", "bbox"],
    rows: function* (geom) {
      if (!Buffer.isBuffer(geom)) throw new TypeError("gpkg_wkb_feature(geom) geom must be a blob");
      yield {
        type: "Feature",
        geometry: JSON.stringify(geomToGeoJSON(geom)),
        bbox: null,
      }
    }
  })

  defineFunction("iconv_decode", { deterministic: true }, function (buffer, encoding) {
    if (buffer == null) return null;
    if (encoding == null) return null;
    if (!Buffer.isBuffer(buffer)) throw new TypeError("iconv_decode(buffer,encoding) buffer must be a blob");
    if (typeof encoding !== "string") throw new TypeError("iconv_decode(buffer,encoding) encoding must be a string");
    return iconv.decode(buffer, encoding);
  })

  defineFunction("iconv_encode", { deterministic: true }, function (str, encoding) {
    if (str == null) return null;
    if (encoding == null) return null;
    if (typeof str !== "string") throw new TypeError("iconv_encode(str,encoding) str must be a string");
    if (typeof encoding !== "string") throw new TypeError("iconv_encode(str,encoding) encoding must be a string");
    return iconv.encode(str, encoding);
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
}

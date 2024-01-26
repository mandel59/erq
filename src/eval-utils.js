import { stdout, stderr } from "node:process";
import { createWriteStream } from "node:fs";
import { DEBUG } from "./options.js";
import { quoteSQLName } from "./parser-utils.js";

/**
 * 
 * @param {string | [string, string]} table 
 * @param {Map<string, string>} env 
 * @returns 
 */
export function resolveTable(table, env) {
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
      throw new Error(`variable ${table} not found`);
    }
    return quoteSQLName(n);
  }
  return table;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {Map<string, string>} env
 * @param {string} sourceSql
 */
export function preprocess(db, env, sourceSql) {
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

/**
 * @param {import("better-sqlite3").Database} db
 * @param {Map<string, string>} env
 * @param {string} sql
 * @returns {any}
 */
export function evalSQLValue(db, env, sql) {
  return db.prepare(sql).pluck().get(Object.fromEntries(env.entries()));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {Map<string, string>} env
 * @param {object} dest 
 * @param {"stdout"|"stderr"|"file"} dest.type
 * @param {string} [dest.file]
 * @param {string} [dest.sql]
 * @returns {{ outputStream: NodeJS.WritableStream, closeOutputStream?: () => void }}
 */
export function evalDestination(db, env, dest) {
  switch (dest.type) {
    case "stdout":
      return { outputStream: stdout };
    case "stderr":
      return { outputStream: stderr };
    case "file":
      let file;
      if (dest.sql) {
        file = evalSQLValue(db, env, preprocess(db, env, dest.sql));
      } else {
        file = dest.file;
      }
      const stream = createWriteStream(file);
      return { outputStream: stream, closeOutputStream: () => stream.close() };
  }
}

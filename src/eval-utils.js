import { stdout, stderr } from "node:process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
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
    const n = evalVariable(env, v);
    if (s != null) {
      return `${s}.${quoteSQLName(n)}`
    } else {
      return quoteSQLName(n);
    }
  }
  if (table[0] === "@") {
    const n = evalVariable(env, table);
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
      return evalVariable(env, name);
    } else if (type === "t") {
      const t = resolveTable(name, env);
      if (DEBUG) {
        console.error("resolved table %s", t);
      }
      return t;
    } else if (type === "e") {
      return evalSQLValue(db, env, name);
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
 * 
 * @param {Map<string, string>} env
 * @param {string} variable 
 * @returns {string}
 */
export function evalVariable(env, variable) {
  const value = env.get(variable.slice(1));
  if (value == null) {
    throw new Error(`variable ${variable} not found`);
  }
  return value;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {Map<string, string>} env
 * @param {object} dest 
 * @param {"stdout"|"stderr"|"file"} dest.type
 * @param {string} [dest.file]
 * @param {string} [dest.sql]
 * @param {string} [dest.variable]
 * @returns {Promise<{ outputStream: NodeJS.WritableStream, closeOutputStream?: () => Promise<void> }>}
 */
export async function evalDestination(db, env, dest) {
  switch (dest.type) {
    case "stdout":
      return { outputStream: stdout };
    case "stderr":
      return { outputStream: stderr };
    case "file":
      let file;
      if (dest.sql) {
        file = evalSQLValue(db, env, preprocess(db, env, dest.sql));
      } else if (dest.variable) {
        file = evalVariable(env, dest.variable);
        if (file == null) {
          throw ReferenceError(`${dest.variable} is not defined`);
        }
      } else {
        file = dest.file;
      }
      if (!file) {
        throw RangeError(`file name must not be null nor empty`)
      }
      await mkdir(dirname(file), {
        recursive: true,
      })
      const stream = createWriteStream(file);
      return {
        outputStream: stream,
        closeOutputStream: async () => {
          await new Promise((resolve, reject) => {
            stream.close((err) => {
              if (err) reject(err)
              resolve()
            })
          })
        },
      };
  }
}

import { stdout, stderr } from "node:process";
import { createWriteStream } from "node:fs";
import { open } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { debugLog } from "./debug.js";
import { quoteSQLName, unquoteSQLName } from "./parser-utils.js";
import { Readable } from "node:stream";

const correlationCache = new Map();

function normalizeIdentifier(name) {
  if (name == null) {
    return null;
  }
  if (typeof name === "string" && name.startsWith("`")) {
    return unquoteSQLName(name);
  }
  return name;
}

function buildQualifier(schema, table, alias) {
  if (alias != null) {
    return alias;
  }
  if (schema != null) {
    return `${schema}.${table}`;
  }
  return table;
}

function resolveSchemaName(db, schemaHint, tableName) {
  const normalizedSchema = normalizeIdentifier(schemaHint);
  if (normalizedSchema != null) {
    return normalizedSchema;
  }
  const row = db.prepare(`
    select schema
    from pragma_table_list
    where name = ?
    order by case schema when 'temp' then 0 when 'main' then 1 else 2 end
    limit 1
  `).get(tableName);
  return row ? row.schema : null;
}

function getForeignKeyMapping(db, childSchema, childTable, parentTable) {
  const cacheKey = JSON.stringify(["fk", childSchema ?? null, childTable, parentTable]);
  if (correlationCache.has(cacheKey)) {
    return correlationCache.get(cacheKey);
  }
  const rows = db.prepare(`
    select id,
           json_group_array("from" order by seq) as from_cols,
           json_group_array("to" order by seq) as to_cols
    from pragma_foreign_key_list(?, ?)
    where "table" = ?
    group by id
  `).all(childTable, childSchema ?? null, parentTable);
  if (rows.length === 0) {
    correlationCache.set(cacheKey, null);
    return null;
  }
  if (rows.length > 1) {
    throw new Error(`ambiguous foreign key between ${childTable} and ${parentTable}`);
  }
  const row = rows[0];
  const fromCols = JSON.parse(row.from_cols).map((c) => c ?? "rowid");
  const toCols = JSON.parse(row.to_cols).map((c) => c ?? "rowid");
  const mapping = { from: fromCols, to: toCols };
  correlationCache.set(cacheKey, mapping);
  return mapping;
}

function buildTupleExpression(qualifier, columns) {
  const qualified = columns.map((column) => `${qualifier}.${quoteSQLName(column)}`);
  if (qualified.length === 1) {
    return qualified[0];
  }
  return `(${qualified.join(", ")})`;
}

function describeTable(schema, table) {
  return schema != null ? `${schema}.${table}` : table;
}

function buildPredicateForContext(db, context, target) {
  if (!Array.isArray(context) || context.length < 2 || !Array.isArray(target) || target.length < 2) {
    throw new Error("invalid correlation payload");
  }
  const [contextSchemaRaw, contextTableRaw, contextAliasRaw] = context;
  const [targetSchemaRaw, targetTableRaw, targetAliasRaw] = target;

  const contextTableName = normalizeIdentifier(contextTableRaw);
  const targetTableName = normalizeIdentifier(targetTableRaw);
  if (contextTableName == null || targetTableName == null) {
    throw new Error("correlation requires concrete table names");
  }

  const contextSchemaName = resolveSchemaName(db, contextSchemaRaw, contextTableName);
  const targetSchemaName = resolveSchemaName(db, targetSchemaRaw, targetTableName);

  const contextQualifier = buildQualifier(contextSchemaRaw, contextTableRaw, contextAliasRaw);
  const targetQualifier = buildQualifier(targetSchemaRaw, targetTableRaw, targetAliasRaw);

  let mapping = getForeignKeyMapping(db, targetSchemaName, targetTableName, contextTableName);
  let referencingQualifier = targetQualifier;
  let referencedQualifier = contextQualifier;

  if (mapping == null) {
    mapping = getForeignKeyMapping(db, contextSchemaName, contextTableName, targetTableName);
    if (mapping == null) {
      return null;
    }
    referencingQualifier = contextQualifier;
    referencedQualifier = targetQualifier;
  }

  const left = buildTupleExpression(referencingQualifier, mapping.from);
  const right = buildTupleExpression(referencedQualifier, mapping.to);
  return `(${left} = ${right})`;
}

function buildCorrelationPredicate(db, contexts, target) {
  const contextList = Array.isArray(contexts) && Array.isArray(contexts[0])
    ? contexts
    : [contexts];
  const predicates = [];
  for (const context of contextList) {
    const predicate = buildPredicateForContext(db, context, target);
    if (predicate != null) {
      predicates.push(predicate);
    }
  }
  if (predicates.length === 0) {
    const firstContext = contextList[0];
    throw new Error(`no foreign key between ${describeTable(firstContext?.[0] ?? null, firstContext?.[1])} and ${describeTable(target?.[0] ?? null, target?.[1])}`);
  }
  if (predicates.length === 1) {
    return predicates[0];
  }
  return `(${predicates.join(" and ")})`;
}

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
  correlationCache.clear();
  const re = /\u0000(.)([^\u0000]*)\u0000/g
  return sourceSql.replace(re, (_, type, name) => {
    debugLog(["general", "preprocess"], "preprocess %s %s", type, name);
    if (type === "v") {
      return evalVariable(env, name);
    } else if (type === "t") {
      const t = resolveTable(name, env);
      debugLog(["general", "preprocess"], "resolved table %s", t);
      return t;
    } else if (type === "e") {
      return evalSQLValue(db, env, name);
    } else if (type === "c") {
      const payload = JSON.parse(name);
      if (!Array.isArray(payload) || payload.length !== 2) {
        throw new Error("invalid correlation payload");
      }
      return buildCorrelationPredicate(db, payload[0], payload[1]);
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
 * @param {"stdout"|"stderr"|"file"|"url"} dest.type
 * @param {string} [dest.file]
 * @param {string} [dest.sql]
 * @param {string} [dest.variable]
 * @param {string} [dest.url]
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
    case "url": {
      const u = new URL(dest.url)
      const { Operator } = await import("opendal")
      switch (u.protocol) {
        case "s3:": {
          const op = new Operator("s3", { bucket: u.hostname });
          const writer = await op.writer(decodeURI(u.pathname));
          const stream = writer.createWriteStream();
          return {
            outputStream: stream,
            closeOutputStream: async () => {
              await writer.close()
            }
          }
        }
        default:
          throw Error("unsupported protocol");
      }
    }
  }
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {Map<string, string>} env
 * @param {object} source 
 * @param {string} [source.path]
 * @param {string} [source.contentType]
 * @param {string} [source.content]
 * @param {string} [source.variable]
 * @param {string} [source.sql]
 * @param {string} [source.as]
 * @param {string} [source.url]
 */
export function evalSource(db, env, source) {
  const contentType = source.contentType
  if (source.url) {
    const u = new URL(source.url);
    /** @type {<T>(callback: (fd: import("opendal").Reader) => Promise<T>) => Promise<T>} */
    async function withFileHandle(callback) {
      const { Operator } = await import("opendal");
      switch (u.protocol) {
        case "http:":
        case "https:": {
          const op = new Operator("http", {
            endpoint: u.origin,
            username: u.username || undefined,
            password: u.password || undefined,
          });
          const fd = await op.reader(decodeURI(u.pathname));
          return await callback(fd);
        }
        case "s3:": {
          const op = new Operator("s3", { endpoint: u.hostname });
          const fd = await op.reader(decodeURI(u.pathname));
          return await callback(fd);
        }
        default:
          throw new Error("unsupported protocol")
      }
    }
    /** @type {(encoding: string, fd: import("opendal").Reader) => Promise<NodeJS.ReadableStream>} */
    async function createReadStream(encoding, fd) {
      const iconv = (await import("iconv-lite")).default;
      const stream = fd.createReadStream()
        .pipe(iconv.decodeStream(encoding));
      return stream;
    }
    /** @type {<T>(encoding: string, callback: (stream: NodeJS.ReadableStream) => Promise<T>) => Promise<T>} */
    async function withReadStream(encoding, callback) {
      return await withFileHandle(async fd => {
        const stream = await createReadStream(encoding, fd)
        return await callback(stream);
      })
    }
    return {
      contentType,
      withFileHandle,
      createReadStream,
      withReadStream,
    }
  }
  let path = source.path
  if (source.variable != null) {
    path ??= evalVariable(env, source.variable);
  }
  let content = source.content;
  if (source.sql != null) {
    const value = evalSQLValue(db, env, preprocess(db, env, source.sql));
    if (source.as === "content") {
      content = value;
    } else if (source.as === "path") {
      path = value;
    }
  }
  /** @type {<T>(callback: (fd: import("node:fs/promises").FileHandle | undefined) => Promise<T>) => Promise<T>} */
  async function withFileHandle(callback) {
    if (path != null) {
      const fd = await open(path);
      try {
        return await callback(fd);
      } finally {
        fd.close();
      }
    } else {
      return await callback(undefined);
    }
  }
  /** @type {(encoding: string, fd: import("node:fs/promises").FileHandle | undefined) => Promise<NodeJS.ReadableStream>} */
  async function createReadStream(encoding, fd) {
    const iconv = (await import("iconv-lite")).default;
    if (fd != null) {
      const stream = fd.createReadStream({ autoClose: false })
        .pipe(iconv.decodeStream(encoding));
      return stream;
    } else {
      const stream = Readable.from(content);
      return stream;
    }
  }
  /** @type {<T>(encoding: string, callback: (stream: NodeJS.ReadableStream) => Promise<T>) => Promise<T>} */
  async function withReadStream(encoding, callback) {
    return await withFileHandle(async fd => {
      const stream = await createReadStream(encoding, fd)
      return await callback(stream);
    })
  }
  return {
    contentType,
    withFileHandle,
    createReadStream,
    withReadStream,
  };
}

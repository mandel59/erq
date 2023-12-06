import process, { stdout } from "node:process";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import Database from "better-sqlite3";

import { uncons } from "./async-iter.js";
import { options, DEBUG } from "./options.js";
import {
  reFQNamePart,
  reParseColumnName,
  quoteSQLName,
  unquoteSQLName,
} from "./parser-utils.js";
import { getJSRuntime } from "./js-runtime.js";

export async function child() {
  if (DEBUG) {
    console.error("child process start");
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
        throw new Error(`variable ${table} not found`);
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

  /** @type {[string, string][]} */
  const globalVars = options.var.map((vv, i) => {
    const m = vv.match(/^([_A-Za-z\u0100-\uffff][_A-Za-z0-9\u0100-\uffff]*)=([\s\S]*)$/)
    if (!m) {
      throw new Error(`Unexpected variable format at #${i + 1}`);
    }
    return [m[1], m[2]];
  });

  const dbpath = options.db ?? ":memory:";
  const db = new Database(dbpath);
  console.error("Connected to %s", dbpath);

  // user functions

  function defineTable(
    /** @type {string} */ name,
    /** @type {Parameters<import("better-sqlite3").Database["table"]>[1]} */ options
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

  const { defineUserFunctions } = await import("../src/user-functions.js");
  defineUserFunctions(defineFunction, defineTable, defineAggregate);

  /** @type {Map<string, (...args: any[]) => Promise<any>>} */
  const ipcExported = new Map();
  function ipcExport(methodFunc) {
    ipcExported.set(methodFunc.name, methodFunc);
  }
  /**
   * @param {string} method 
   * @param {any[]} params 
   * @returns {Promise<any>}
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
    const tables =
      /** @type {{schema: string, name: string, type: string, ncol: number, wr: 0 | 1, strict: 0 | 1}[]} */
      (db.prepare("pragma table_list").all());
    return tables;
  }

  function getAllModules() {
    const names =
      /** @type {string[]} */
      (db.prepare("select name from pragma_module_list where name not glob 'pragma_*'").pluck().all());
    return names;
  }

  function getAllFunctionNames() {
    const names =
      /** @type {string[]} */
      (db.prepare("select name from pragma_function_list").pluck().all());
    return names.map(name => quoteSQLName(name));
  }

  function getColumns(schema, table) {
    if (schema == null) {
      const columns =
        /** @type {{cid: number, name: string, type: string, notnull: 0 | 1, dflt_value: any, pk: 0 | 1, hidden: 0 | 1 | 2}[]} */
        (db.prepare(`pragma table_xinfo(${quoteSQLName(table)})`).all());
      return columns;
    }
    const columns =
      /** @type {{cid: number, name: string, type: string, notnull: 0 | 1, dflt_value: any, pk: 0 | 1, hidden: 0 | 1 | 2}[]} */
      (db.prepare(`pragma ${quoteSQLName(schema)}.table_xinfo(${quoteSQLName(table)})`).all());
    return columns;
  }

  function getPragmaNames() {
    const tables =
      /** @type {{name: string}[]} */
      (db.prepare("pragma pragma_list").all());
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
      if (v === true) return 1n;
      if (v === false) return 0n;
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
   * @param {{command: string, args: any[] | any}} param0
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
        const [{ default: iconv }, { parse: parseCSV }] = await Promise.all([import("iconv-lite"), import("csv-parse")]);
        const stream = path != null ? (await open(path)).createReadStream().pipe(iconv.decodeStream(encoding)) : Readable.from(content);
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
        const [{ default: iconv }, ndjson] = await Promise.all([import("iconv-lite"), import("ndjson")]);
        const fileHandle = path != null ? await open(path) : null;
        try {
          let stream = fileHandle != null ? fileHandle.createReadStream({ autoClose: false }).pipe(iconv.decodeStream(encoding)) : Readable.from(content);
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
            stream = path != null ? fileHandle.createReadStream({ autoClose: false, start: 0 }).pipe(iconv.decodeStream(encoding)) : Readable.from(content);
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
        } finally {
          fileHandle?.close();
        }
        return true;
      } else {
        console.error("unknown content type: %s", contentType);
        return false;
      }
    }
    else if (command === "meta-create-function") {
      const [fn, ps, { rawblock: [tag, body] }] = args;
      if (tag === "js" || tag === "javascript") {
        const rt = await getJSRuntime();
        rt.setFunction(fn, ps, body);
        db.function(fn, { varargs: true }, (...args) => {
          return rt.callFunction(fn, ...args);
        });
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
          // @ts-ignore
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

  async function runSqls(statements, env = new Map(globalVars)) {
    try {
      for (const statement of statements) {
        if (statement.type === "command") {
          const ok = await runCLICommand(statement, env);
          if (!ok) return false;
          continue;
        }
        if (statement.type === "if") {
          const { condition: conditionSql, thenStatements, elseStatements = [] } = statement;
          const sql = `select case when ${preprocess(conditionSql, env)} then 1 else 0 end`;
          console.error(sql);
          const stmt = db.prepare(sql);
          const condition = stmt.pluck().get(Object.fromEntries(env.entries()));
          const ok = await runSqls(condition ? thenStatements : elseStatements, env);
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
            // @ts-ignore
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
          const [vega, vegaLite] = await Promise.all([
            import("vega"),
            import("vega-lite"),
          ]);
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
          // @ts-ignore
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
            // @ts-ignore
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
      // @ts-ignore
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

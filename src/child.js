import process from "node:process";
import { open, readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import Database from "better-sqlite3";

import { uncons } from "./async-iter.js";
import { options, DEBUG } from "./options.js";
import {
  quoteSQLName,
  unquoteSQLName,
  modulePathNameToName,
} from "./parser-utils.js";
import { JSRuntimeError, getJSRuntime } from "./js-runtime.js";
import { evalDestination, preprocess, evalSQLValue } from "./eval-utils.js";
import { getEscapeCsvValue } from "./csv-utils.js";
import { ErqCliCompleter } from "./completer.js";
import { ErqClient } from "./erq-client.js";
import { deserializeVars } from "./serialize-vars.js";

export async function child() {
  if (DEBUG) {
    console.error("child process start pid:%s", process.pid);
  }

  const initCwd = process.cwd();
  let ready = false;

  function sendReady() {
    if (ready) return;
    process.send("ready");
    ready = true;
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

  const modules = new Map();

  const loadModule = async (name, modulePrefix) => {
    const importModule = modules.get(name);
    if (!importModule) {
      throw new Error(`module ${name} not found`);
    }
    const { default: module } = await importModule();
    await module.load({ context: moduleContext, modulePrefix });
  }

  function registerModule(name, importModule) {
    modules.set(name, importModule);
  }

  function findModules(prefix) {
    const list = [];
    for (const name of modules.keys()) {
      if (name.startsWith(prefix)) {
        list.push(name);
      }
    }
    return list;
  }

  const moduleContext = {
    defineTable,
    defineFunction,
    defineAggregate,
    registerModule,
  }

  registerModule("global", () => import("./modules/global.js"));
  await loadModule("global", "");

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

  const erqCliCompleter = new ErqCliCompleter({
    db,
    findModules,
  });

  /**
   * Complete Erq query
   * @param {string} line 
   */
  async function completer(line) {
    return erqCliCompleter.complete(line);
  }
  ipcExport(completer);

  let sigint = false;
  const interruptedSymbol = Symbol("Interrupted");
  let interruptedPromise, interruptedPromiseReject;
  function resetInterruptedPromise() {
    interruptedPromise = new Promise((resolve, reject) => interruptedPromiseReject = reject);
    interruptedPromise.catch(() => {
      // ignore
    });
  }
  resetInterruptedPromise();
  async function interrupt() {
    sigint = true;
    interruptedPromiseReject(interruptedSymbol);
    resetInterruptedPromise();
  }
  ipcExport(interrupt);
  async function resetSigint() {
    sigint = false;
  }
  ipcExport(resetSigint);

  // global state

  /** @type {{ format: string; formatOptions?: any; }} */
  let outputFormat = { format: "dense" };
  let defaultDestination = { type: "stdout" };

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
          outputFormat = { format: "dense" };
          return true;
        } else if (args[0] === "object") {
          outputFormat = { format: "sparse" };
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
    else if (command === "meta-load-module") {
      const [modulePath, name] = args;
      const moduleName = modulePathNameToName(modulePath);
      const modulePrefix = `${name ? unquoteSQLName(name) : moduleName}::`;
      await loadModule(moduleName, modulePrefix);
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
        const value = evalSQLValue(db, env, preprocess(db, env, args.sql));
        if (args.as === "content") {
          content = value;
        } else if (args.as === "path") {
          path = value;
        }
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
        console.error("unknown content type: %s", format);
        return false;
      }
    }
    else if (command === "meta-create-function") {
      const [fn, ps, code, opts] = args;
      let tag, body;
      if (typeof code === "string") {
        body = code;
      } else if ("rawblock" in code) {
        ({ rawblock: [tag, body] } = code);
      }
      if ("language" in opts && typeof opts.language === "string") {
        tag = opts.language;
      }
      const type = opts.type ?? "scalar";
      if (tag === "js" || tag === "javascript") {
        const rt = await getJSRuntime();
        if (type === "scalar") {
          rt.setFunction(fn, ps, body);
          db.function(fn, { varargs: true }, (...args) => {
            return rt.callFunction(fn, ...args);
          });
        } else if (type === "table") {
          let returns = opts.returns;
          if (!Array.isArray(returns)) {
            returns = [["value", returns]];
          }
          rt.setGeneratorFunction(fn, ps, body);
          db.table(fn, {
            parameters: ps,
            columns: returns.map(([name, _type]) => name),
            *rows(...args) {
              for (const value of rt.callGeneratorFunction(fn, ...args)) {
                if (Array.isArray(value)) {
                  yield value;
                } else {
                  yield [value];
                }
              }
            },
          });
        }
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
      const jsonsql = jsonsqlSource && preprocess(db, env, jsonsqlSource);
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

  async function runSqlsWithEnv(statements, env) {
    try {
      for (const statement of statements) {
        if (statement.type === "command") {
          const ok = await runCLICommand(statement, env);
          if (!ok) return false;
          continue;
        }
        if (statement.type === "if") {
          const { condition: conditionSql, thenStatements, elseStatements } = statement;
          const sql = `select case when ${preprocess(db, env, conditionSql)} then 1 else 0 end`;
          console.error(sql);
          const stmt = db.prepare(sql);
          const condition = stmt.pluck().get(Object.fromEntries(env.entries()));
          const ok = await runSqlsWithEnv(condition ? thenStatements : elseStatements ?? [], env);
          if (!ok) return false;
          continue;
        }
        if (statement.type === "while") {
          const { condition: conditionSql, bodyStatements } = statement;
          const sql = `select case when ${preprocess(db, env, conditionSql)} then 1 else 0 end`;
          console.error(sql);
          const stmt = db.prepare(sql);
          let condition = stmt.pluck().get(Object.fromEntries(env.entries()));
          while (condition) {
            const ok = await runSqlsWithEnv(bodyStatements, env);
            if (!ok) return false;
            console.error(sql);
            condition = stmt.pluck().get(Object.fromEntries(env.entries()));
          }
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
          }).join(", ")} from (${preprocess(db, env, sourceTable)})`
          console.error(sourceSql);
          const t0 = performance.now();
          const stmt = db.prepare(sourceSql);
          stmt.safeIntegers(true);
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
            const ok = await runSqlsWithEnv(bodyStatements, env2);
            if (!ok) return false;
          }
          continue;
        }
        if (statement.type === "parallel") {
          if (!ready) {
            console.error("parallel is not supported in init script");
            return false;
          }
          const {
            assignments,
            sourceTable,
            bodyStatements,
          } = statement
          const sourceSql = `select ${assignments.map(({ name, expression }) => {
            if (expression == null) return name;
            return `${expression} as ${name}`
          }).join(", ")} from (${preprocess(db, env, sourceTable)})`
          console.error(sourceSql);
          const t0 = performance.now();
          const stmt = db.prepare(sourceSql);
          stmt.safeIntegers(true);
          const vars = [...env.entries()];
          const t1 = performance.now();
          const records = stmt.all(Object.fromEntries(env.entries()));
          const t = t1 - t0;
          const i = records.length;
          const rows = (i === 1) ? "1 row" : `${i} rows`;
          console.error("%s loaded (%ss)", rows, (t / 1000).toFixed(3));
          {
            /** @type {ErqClient[]} */
            const clients = [];
            /** @type {Promise<void>[]} */
            const promises = [];
            const t0 = performance.now();
            try {
              for (const row of records) {
                for (const { variable } of assignments) {
                  const v = variable.slice(1);
                  vars.push([v, row[v]]);
                }
                const client = await ErqClient.connect(process.argv.slice(2), {
                  stdin: 'ignore',
                  stdout: 'ignore',
                  stderr: 'ignore',
                  cwd: initCwd,
                });
                clients.push(client);
                const promise = client.runSqls(bodyStatements, vars).then(ok => {
                  if (!ok) {
                    throw new Error("parallel failed");
                  }
                });
                promise.catch(() => {
                  // ignore unhandled rejection
                });
                promises.push(promise);
              }
              await Promise.race([Promise.all(promises), interruptedPromise]);
              const t1 = performance.now();
              const t = t1 - t0;
              if (promises.length === 1) {
                console.error("%s process has finished (%ss)", promises.length, (t / 1000).toFixed(3));
              } else {
                console.error("%s processes have finished (%ss)", promises.length, (t / 1000).toFixed(3));
              }
            } catch (error) {
              if (error === interruptedSymbol) {
                console.error("Interrupted");
                const t1 = performance.now();
                const t = t1 - t0;
                if (promises.length === 1) {
                  console.error("%s process aborted (%ss)", promises.length, (t / 1000).toFixed(3));
                } else {
                  console.error("%s processes aborted (%ss)", promises.length, (t / 1000).toFixed(3));
                }
                return false;
              }
              console.error("%s: %s", error.name, error.message);
              if (DEBUG && error?.stack) {
                console.error(error.stack);
              }
              return false;
            } finally {
              for (const client of clients) {
                try {
                  client.quit(0);
                } catch (error) {
                  console.error("%s: %s", error.name, error.message);
                  if (DEBUG && error?.stack) {
                    console.error(error.stack);
                  }
                }
              }
            }
          }
          continue;
        }
        const {
          type,
          query: sourceSql,
          returning,
          format = outputFormat.format,
          formatOptions = outputFormat.formatOptions ?? {},
          dest = defaultDestination,
        } = statement;
        if (sigint) {
          break;
        }
        const sql = preprocess(db, env, sourceSql);
        console.error(sql);
        const t0 = performance.now();
        const stmt = db.prepare(sql);
        if (typeof format === "object" && format.type === "vega") {
          stmt.raw(false);
          stmt.safeIntegers(false);
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
            const { outputStream, closeOutputStream } = evalDestination(db, env, dest);
            try {
              if (!outputStream.write(JSON.stringify(spec))) {
                await new Promise(resolve => outputStream.once("drain", () => resolve()));
              }
              if (!outputStream.write("\n")) {
                await new Promise(resolve => outputStream.once("drain", () => resolve()));
              }

            } finally {
              if (closeOutputStream) {
                closeOutputStream();
              }
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
            const { outputStream, closeOutputStream } = evalDestination(db, env, dest);
            try {
              if (!outputStream.write(svg)) {
                await new Promise(resolve => outputStream.once("drain", () => resolve()));
              }
              if (!outputStream.write("\n")) {
                await new Promise(resolve => outputStream.once("drain", () => resolve()));
              }
            } finally {
              if (closeOutputStream) {
                closeOutputStream();
              }
            }
            continue;
          }
          // render PNG image
          const canvas = await vgView.toCanvas();
          // @ts-ignore
          const png = canvas.toBuffer();
          const size = png.length;
          const { outputStream, closeOutputStream } = evalDestination(db, env, dest);
          if (format.format === "png") {
            outputStream.write(png);
            continue;
          }
          try {
            if (!outputStream.write(`\x1b]1337;File=inline=1;size=${size}:`)) {
              await new Promise(resolve => outputStream.once("drain", () => resolve()));
            }
            if (!outputStream.write(png.toString("base64"))) {
              await new Promise(resolve => outputStream.once("drain", () => resolve()));
            }
            if (!outputStream.write('\x07\n')) {
              await new Promise(resolve => outputStream.once("drain", () => resolve()));
            }
          } finally {
            if (closeOutputStream) {
              closeOutputStream();
            }
          }
          continue;
        }
        if (type === "select" || type === "pragma" || returning) {
          stmt.raw(true);
          stmt.safeIntegers(true);
          const columns = stmt.columns();
          const columnNames = columns.map(c => c.name);
          let interrupted = false;
          let i = 0;

          /**
           * @param {string} format
           * @param {any} formatOptions
           * @param {NodeJS.WritableStream} outputStream
           * @returns {Promise<(r: any[]) => Promise<void>>}
           */
          const createFormatter = async (format, formatOptions, outputStream) => {
            /**
             * @param {Buffer} v
             */
            async function writeBufferAsJsonArray(v) {
              // write buffer
              if (!outputStream.write("[")) {
                await new Promise(resolve => outputStream.once("drain", () => resolve()));
              }
              let j = 0;
              for (const c of v) {
                if (j > 0) {
                  if (!outputStream.write(",")) {
                    await new Promise(resolve => outputStream.once("drain", () => resolve()));
                  }
                }
                if (!outputStream.write(String(c))) {
                  await new Promise(resolve => outputStream.once("drain", () => resolve()));
                }
                j++;
              }
              if (!outputStream.write("]")) {
                await new Promise(resolve => outputStream.once("drain", () => resolve()));
              }
            }
            if (format !== "eqp") {
              console.error(JSON.stringify(columnNames));
            }
            if (format === "sparse") return async (r) => {
              const omitNull = formatOptions.omitNull ?? false;
              if (!outputStream.write("{")) {
                await new Promise(resolve => outputStream.once("drain", () => resolve()));
              }
              let first = true;
              for (let i = 0; i < r.length; i++) {
                const v = r[i];
                if (omitNull && v == null) continue;
                if (first) {
                  first = false;
                } else {
                  if (!outputStream.write(",")) {
                    await new Promise(resolve => outputStream.once("drain", () => resolve()));
                  }
                }
                if (!outputStream.write(JSON.stringify(columnNames[i]))) {
                  await new Promise(resolve => outputStream.once("drain", () => resolve()));
                }
                if (!outputStream.write(":")) {
                  await new Promise(resolve => outputStream.once("drain", () => resolve()));
                }
                if (typeof v === "bigint") {
                  if (!outputStream.write(String(v))) {
                    await new Promise(resolve => outputStream.once("drain", () => resolve()));
                  }
                } else if (v !== null && typeof v === "object") {
                  await writeBufferAsJsonArray(v);
                } else {
                  if (!outputStream.write(JSON.stringify(v))) {
                    await new Promise(resolve => outputStream.once("drain", () => resolve()));
                  }
                }
              }
              if (!outputStream.write("}\n")) {
                await new Promise(resolve => outputStream.once("drain", () => resolve()));
              }
            }
            if (format === "eqp") {
              if (!outputStream.write("* QUERY PLAN\n")) {
                await new Promise(resolve => outputStream.once("drain", () => resolve()));
              }
              return createEqpFormatter(format, formatOptions, outputStream);
            }
            if (format === "raw") return async (r) => {
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
            if (format === "csv") {
              const delimiter = formatOptions.delimiter ?? ",";
              const quote = formatOptions.quote;
              const escape = formatOptions.escape;
              const escapeCsvValue = getEscapeCsvValue(quote, escape);
              if (formatOptions.header) {
                const s = columnNames.map(escapeCsvValue).join(delimiter);
                if (!outputStream.write(s + "\n")) {
                  await new Promise(resolve => outputStream.once("drain", () => resolve()));
                }
              }
              return async (r) => {
                for (let i = 0; i < r.length; i++) {
                  if (i > 0) {
                    if (!outputStream.write(delimiter)) {
                      await new Promise(resolve => outputStream.once("drain", () => resolve()));
                    }
                  }
                  if (!outputStream.write(escapeCsvValue(r[i]))) {
                    await new Promise(resolve => outputStream.once("drain", () => resolve()));
                  }
                }
                if (!outputStream.write("\n")) {
                  await new Promise(resolve => outputStream.once("drain", () => resolve()));
                }
              }
            }
            return async (r) => {
              // default dense format
              if (!outputStream.write("[")) {
                await new Promise(resolve => outputStream.once("drain", () => resolve()));
              }
              for (let i = 0; i < r.length; i++) {
                const v = r[i];
                if (i > 0) {
                  if (!outputStream.write(",")) {
                    await new Promise(resolve => outputStream.once("drain", () => resolve()));
                  }
                }
                if (typeof v === "bigint") {
                  if (!outputStream.write(String(v))) {
                    await new Promise(resolve => outputStream.once("drain", () => resolve()));
                  }
                } else if (v !== null && typeof v === "object") {
                  await writeBufferAsJsonArray(v);
                } else {
                  if (!outputStream.write(JSON.stringify(v))) {
                    await new Promise(resolve => outputStream.once("drain", () => resolve()));
                  }
                }
              }
              if (!outputStream.write("]\n")) {
                await new Promise(resolve => outputStream.once("drain", () => resolve()));
              }
            }
          }

          let { outputStream, closeOutputStream } = evalDestination(db, env, dest);
          if (formatOptions.encoding) {
            const { default: iconv } = await import("iconv-lite");
            const encoder = iconv.encodeStream(formatOptions.encoding);
            encoder.pipe(outputStream);
            outputStream = encoder;
          }
          const formatter = await createFormatter(format, formatOptions, outputStream);
          try {
            for (const r of stmt.iterate(Object.fromEntries(env.entries()))) {
              i++;
              // @ts-ignore
              await formatter(r);
              if (i % 100 === 0) {
                await new Promise(resolve => setImmediate(() => resolve()));
              }
              if (sigint) {
                console.error("Interrupted");
                interrupted = true;
                break;
              }
            }
          } finally {
            if (closeOutputStream) {
              closeOutputStream();
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
      if (error instanceof JSRuntimeError && error.runtimeStack) {
        console.error(error.runtimeStack.trimEnd());
      }
      if (DEBUG && error?.stack) {
        console.error(error.stack);
      }
      return false;
    } finally {
      sigint = false;
    }
    return true;
  }

  /**
   * 
   * @param {any[]} sqls 
   * @param {[string, string, string][]} [vars] 
   * @returns 
   */
  async function runSqls(sqls, vars = []) {
    const env = new Map(globalVars)
    for (const [k, v] of deserializeVars(vars)) {
      env.set(k, v);
    }
    return await runSqlsWithEnv(sqls, env);
  }
  ipcExport(runSqls);

  /**
   * Evaluate Erq script
   * @param {string} erqScript 
   * @param {[string, string, string][]} [vars] 
   */
  async function runScript(erqScript, vars = []) {
    if (DEBUG) {
      console.error("pid:%s runScript:%s", process.pid, JSON.stringify(erqScript));
    }
    const parser = await import("../dist/erq.js");
    const sqls = parser.parse(erqScript, { startRule: "script" })
    return await runSqls(sqls, vars);
  }
  ipcExport(runScript);

  /**
   * Run Erq script file
   * @param {string} filepath 
   * @param {[string, string, string][]} [vars] 
   */
  async function runFile(filepath, vars) {
    if (DEBUG) {
      console.error("pid:%s runFile:%s", process.pid, JSON.stringify(filepath));
    }
    const erqScript = await readFile(filepath, "utf-8");
    return await runScript(erqScript, vars);
  }
  ipcExport(runFile);

  async function quit(status) {
    db.close();
    process.exit(status);
  }
  ipcExport(quit);

  function getErqContext() {
    return {
      globalVars,
    }
  }
  ipcExport(getErqContext);

  /**
   * 
   * @param {object} context 
   * @param {[string, string][]} context.globalVars
   */
  function setErqContext(context) {
    globalVars.splice(0, globalVars.length);
    for (const [k, v] of context.globalVars) {
      globalVars.push([k, v]);
    }
  }
  ipcExport(setErqContext);

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

  if (options.init) {
    const ok = await runFile(options.init);
    if (!ok) {
      await quit(1);
      // never reach here
    }
  }

  sendReady();
}

/**
 * Format EXPLAIN QUERY PLAN output.
 * @returns 
 */
function createEqpFormatter(format, formatOptions, outputStream) {
  const nodes = [];
  return async ([id, parent, _notused, detail]) => {
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

import { erqKeywords, keywords } from "./keywords.js";
import { quoteSQLName, reFQNamePart, reParseColumnName, unquoteSQLName } from "./parser-utils.js";

function quoteErqName(name) {
  return name.split("::").map(part => quoteSQLName(part)).join("::");
}
export class ErqCliCompleter {
  /** @type {import("better-sqlite3").Database} */
  db;
  /** @type {(prefix: string) => string[]} */
  findModules;
  /**
   * @param {ErqCliContext} context 
   * @typedef ErqCliContext
   * @property {import("better-sqlite3").Database} db
   * @property {(prefix: string) => string[]} findModules
   */
  constructor(context) {
    this.db = context.db;
    this.findModules = context.findModules;
  }
  getTables() {
    const tables =
      /** @type {{schema: string, name: string, type: string, ncol: number, wr: 0 | 1, strict: 0 | 1}[]} */
      (this.db.prepare("pragma table_list").all());
    return tables;
  }
  /**
   * @param {"table" | "view"} type 
   */
  getTablesOnly(type) {
    const tables =
      /** @type {{schema: string, name: string, type: string, ncol: number, wr: 0 | 1, strict: 0 | 1}[]} */
      (this.db.prepare("select * from pragma_table_list where type = ? and name not glob 'sqlite_*'").all(type));
    return tables;
  }
  getPragmaNames() {
    const tables =
      /** @type {{name: string}[]} */
      (this.db.prepare("pragma pragma_list").all());
    return tables.map(({ name }) => name);
  }
  getAllModules() {
    const names =
      /** @type {string[]} */
      (this.db.prepare("select name from pragma_module_list where name not glob 'pragma_*'").pluck().all());
    return names;
  }
  getColumns(schema, table) {
    if (schema == null) {
      const columns =
        /** @type {{cid: number, name: string, type: string, notnull: 0 | 1, dflt_value: any, pk: 0 | 1, hidden: 0 | 1 | 2}[]} */
        (this.db.prepare(`pragma table_xinfo(${quoteSQLName(table)})`).all());
      return columns;
    }
    const columns =
      /** @type {{cid: number, name: string, type: string, notnull: 0 | 1, dflt_value: any, pk: 0 | 1, hidden: 0 | 1 | 2}[]} */
      (this.db.prepare(`pragma ${quoteSQLName(schema)}.table_xinfo(${quoteSQLName(table)})`).all());
    return columns;
  }
  getAllFunctionNames() {
    const names =
      /** @type {string[]} */
      (this.db.prepare("select name from pragma_function_list").pluck().all());
    return names.map(name => quoteErqName(name));
  }
  async complete(line) {
    const m = reFQNamePart.exec(line);
    const q = m[0];
    const qq = q.replace(/`/g, "");

    // pragma completion
    const isPragma = /pragma\s+\w*$/.test(line);
    if (isPragma) {
      return [this.getPragmaNames().filter(n => n.startsWith(q)), q];
    }

    const matchDropTable = new RegExp(`drop\\s+(table|view)\\s+(?:if\\s+exists\\s+)?(?:\\S+|\`[^\`]*\`?)*$`, "u").exec(line);
    if (matchDropTable) {
      const t = /** @type {"table"|"view"} */ (matchDropTable[1]);
      return [this.getTablesOnly(t).flatMap(t => {
        return [quoteErqName(t.name), `${quoteErqName(t.schema)}.${quoteErqName(t.name)}`];
      }).filter(n => n.startsWith(q)).sort(), q];
    }

    const matchLoadModule = new RegExp(`load\\s+module\\s+(?:\\S+|\`[^\`]*\`?)*$`, "u").exec(line);
    if (matchLoadModule) {
      const modules = this.findModules(q);
      return [modules.sort(), q];
    }

    try {
      const tables = this.getTables();
      const modules = this.getAllModules();
      const pragmas = this.getPragmaNames();
      const schemas = Array.from(new Set(tables.map(t => t.schema)).values(), s => quoteSQLName(s));
      const tableNamesFQ = tables.map(t => `${quoteSQLName(t.schema)}.${quoteErqName(t.name)}`);
      const moduleIsTableValueFunction = this.db.prepare("select exists (select * from pragma_table_xinfo(?) where (hidden))").pluck()
      const tableNames = tables.map(t => t.name).concat(modules).map(m => {
        try {
          if (moduleIsTableValueFunction.get([m])) {
            return `${quoteErqName(m)}(`;
          }
        } catch { }
        return quoteErqName(m);
      });
      let _getAllColumnNames;
      const getAllColumnNames = () => {
        if (_getAllColumnNames) return _getAllColumnNames;
        return _getAllColumnNames = Array.from(new Set(tables.flatMap(t => {
          try {
            return this.getColumns(t.schema, t.name)
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
            const columns = this.getColumns(sn, tn).filter(c => c.hidden !== 1 && c.name.startsWith(cn));
            let candidates;
            if (m2 != null) {
              const qtn = `${quoteSQLName(sn)}.${quoteSQLName(tn)}`;
              candidates = columns.map(c => `${qtn}.${quoteSQLName(c.name)}`);
            } else {
              const qtn = quoteSQLName(tn);
              candidates = columns.map(c => `${qtn}.${quoteSQLName(c.name)}`);
            }
            return [candidates, q]
          } else if (schemas.includes(tn)) {
            let candidates = tables
              .filter(t => t.schema === tn)
              .map(t => quoteSQLName(t.name))
              .filter(name => name.startsWith(cn))
              .map(name => `${quoteSQLName(tn)}.${name}`);
            if (tn === "main") {
              candidates = candidates.concat(
                modules.filter(n => n.startsWith(cn)).map(n => `main.${n}(`)
              );
            }
            if (candidates.length > 0) {
              return [candidates, q];
            }
          } else if (modules.includes(tn)) {
            const columns = this.getColumns(null, tn).filter(c => c.hidden !== 1 && c.name.startsWith(cn));
            return [columns.map(c => `${tn}.${quoteSQLName(c.name)}`), q];
          } else if (tn.startsWith("pragma_") && pragmas.includes(tn.slice("pragma_".length))) {
            const columns = this.getColumns(null, tn).filter(c => c.hidden !== 1 && c.name.startsWith(cn));
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
        const functionNames = this.getAllFunctionNames();
        const matches
          = Array.from(new Set([
            ...keywords,
            ...erqKeywords,
            ...schemas,
            ...tableNames,
            ...tableNamesFQ,
            ...columnNames,
            ...functionNames.map(n => `${n}(`),
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
      // ignore error
      console.error(error);
    }
    return [[], q];
  }
}

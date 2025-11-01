import mergeWith from "lodash.mergewith";

import { keywords } from "./keywords.js";

const contextStack = [[]];

function getCurrentContexts() {
  const top = contextStack[contextStack.length - 1];
  return top ?? [];
}

function withTableContexts(contexts, fn) {
  contextStack.push(contexts);
  try {
    return fn();
  } finally {
    contextStack.pop();
  }
}

export function merge(x, ...args) {
  return mergeWith(x, ...args, (a, b) => {
    if (Array.isArray(a)) {
      return a.concat(b);
    }
  });
}

export const patIdent = "[_\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}][\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}\\p{Mc}\\p{Nd}\\p{Pc}\\p{Cf}]*";
export const patQuot = "(?:(?:`[^`]*`)+)";
export const patQuotPart = "(?:`[^`]*(?:``[^`]*)*`?)";
export const patName = `(?:${patQuot}|${patIdent})`;
export const patNamePart = `(?:${patQuotPart}|${patIdent})`;
export const patModule = `(?:${patName}(?:::${patName})*)`;
export const patModulePart = `(?:(?:${patName}::)*(?:${patName}:{0,2}|${patNamePart}))`;
export const reIdent = new RegExp(`^${patIdent}$`, "u");
export const reFQNamePart = new RegExp(`(?:${patQuotPart}|(?:${patName}\\.${patModule}\\.${patNamePart}?)|${patModule}\\.${patNamePart}?|${patModulePart})?$`, "u");

/**
 * Parse dot-separated name like `t.c` or `s.t.c`.
 * Used as `m = reParseColumnName.exec(q);`.
 * `m[1]`: schema or table name.
 * `m[2]`: table name if schema name is specified.
 * `m[3]`: column name.
 */
export const reParseColumnName = new RegExp(`^(${patIdent}|${patQuot})(?:\\.(${patIdent}|${patQuot}))?\\.(${patIdent}|${patQuot}|${patQuotPart})?$`, "u");

export function quoteSQLName(name) {
  if (!reIdent.test(name)) {
    if (name.includes("\u0000")) {
      throw new RangeError("SQL name cannot contain NUL character");
    }
    return `\`${name.replace(/`/g, "``")}\``;
  }
  return name;
}

export function unquoteSQLName(quot) {
  if (quot[0] === "`") {
    if (quot[quot.length - 1] === "`") {
      return quot.substring(1, quot.length - 1).replace(/``/g, "`");
    }
    return quot.substring(1).replace(/``/g, "`");
  }
  return quot;
}

export function parseSQLStringLiteral(l) {
  return l.substring(1, l.length - 1).replace(/''/g, "'");
}

export function intoSQLIdentifier(n) {
  if (keywords.has(n.toLowerCase())) {
    return `\`${n}\``;
  }
  return n;
}

export function parseEscapedStringBody(b) {
  return b.replace(/''|\\u\{[0-9A-Fa-f]+\}|\\u[0-9A-Fa-f]{4}|\\x[0-9A-Fa-f]{2}|\\['"\/\\bfnrt]/g, function (s) {
    if (s === "''") return "'";
    if (s === "\\'") return "'";
    if (s === "\\\"") return '"';
    if (s === "\\\\") return "\\";
    if (s === "\\b") return "\b";
    if (s === "\\f") return "\f";
    if (s === "\\n") return "\n";
    if (s === "\\r") return "\r";
    if (s === "\\t") return "\t";
    if (s.startsWith("\\x")) return String.fromCodePoint(parseInt(s.substring(2), 16));
    if (s.startsWith("\\u{")) return String.fromCodePoint(parseInt(s.substring(3, s.length - 1), 16));
    if (s.startsWith("\\u")) return String.fromCodePoint(parseInt(s.substring(2), 16));
    return s;
  });
}

export function isIdentifier(n) {
  return reIdent.test(n);
}

export function quote(value) {
  if (value == null) {
    return "null";
  }
  if (typeof value === "string") {
    if (value.includes("\u0000")) {
      return `(${value.split("\u0000").map(
        (v) => `'${v.replace(/'/g, "''")}'`
      ).join("||char(0)||")})`;
    }
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (value != null && typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return String(value);
}

export function escapeVegaField(f) {
  return f.replace(/[\[\]\\.]/g, "\\$&");
}

export class TableBuilder {
  #name;
  #lastName;
  #expression;
  #rename;
  #relation;
  #contexts;
  #join = [];
  #where = [];
  #window = [];
  #group = [];
  #having = [];
  #select = [];
  #distinct = false;
  #order = [];
  #limit = null;
  #offset = 0;
  #aggregate = false;
  #rawSQL = undefined;
  constructor(name, expression, rename = name != null, options = {}) {
    if (typeof rename === "object" && options === undefined) {
      options = rename ?? {};
      rename = name != null;
    }
    this.#name = this.#lastName = name;
    this.#expression = expression;
    this.#rename = rename;
    this.#relation = options.relation ?? null;
    const baseContexts = options.contexts ?? getCurrentContexts();
    this.#contexts = baseContexts.map((ctx) => [...ctx]);
    const alias = name ?? (this.#relation ? this.#relation.table : null);
    if (this.#relation) {
      this.#registerContext(this.#relation.schema ?? null, this.#relation.table, alias);
    }
    if (options.correlate) {
      const correlateAlias = alias ?? options.correlate.table;
      const correlatePayload = [
        options.correlate.schema ?? null,
        options.correlate.table,
        correlateAlias,
      ];
      this.#where.push(`\u0000^${JSON.stringify(correlatePayload)}\u0000`);
    }
  }
  #registerContext(schema, table, alias) {
    if (table == null) {
      return;
    }
    const effectiveAlias = alias ?? table;
    for (const ctx of this.#contexts) {
      if (ctx[0] === (schema ?? null) && ctx[1] === table && ctx[2] === effectiveAlias) {
        return;
      }
    }
    this.#contexts.push([schema ?? null, table, effectiveAlias]);
  }
  #applyCorrelation(sql) {
    if (typeof sql !== "string" || sql.indexOf("\u0000^") === -1) {
      return sql;
    }
    if (this.#contexts == null || this.#contexts.length === 0) {
      return sql;
    }
    return sql.replace(/\u0000\^([^\u0000]*)\u0000/g, (_match, payload) => {
      let target;
      try {
        target = JSON.parse(payload);
      } catch {
        return `\u0000^${payload}\u0000`;
      }
      const contextsPayload = this.#contexts.length === 1 ? this.#contexts[0] : this.#contexts;
      return `\u0000c${JSON.stringify([contextsPayload, target])}\u0000`;
    });
  }
  toSQL(allowOrdered = false) {
    return withTableContexts(this.#contexts, () => {
      if (this.#rawSQL != null) {
        return this.#rawSQL;
      }
      const columns = this.#select;
      let sql = "select ";
      if (this.#distinct) {
        sql += "distinct ";
      }
      if (columns.length === 0) {
        sql += "*";
      } else {
        let i = 0;
        for (const s of columns) {
          i++;
          if (i > 1) {
            sql += ", ";
          }
          sql += s.expression;
          if (s.name && s.name !== s.expression) {
            sql += " as ";
            sql += s.name;
          }
        }
      }
      if (this.#expression) {
        sql += " from ";
        sql += this.#expression;
        if (this.#rename && this.#name !== this.#expression) {
          sql += " as ";
          sql += this.#name;
        }
      }
      for (const j of this.#join) {
        if (j.direction) {
          sql += " ";
          sql += j.direction;
        }
        sql += " join ";
        sql += j.expression;
        if (j.rename && j.name !== j.expression) {
          sql += " as ";
          sql += j.name;
        }
        if (j.using) {
          sql += " using (";
          sql += j.using.join(", ");
          sql += ")";
        }
        if (j.on) {
          sql += " on ";
          sql += j.on;
        }
      }
      if (this.#where.length > 0) {
        sql += " where "
        let i = 0;
        for (const w of this.#where) {
          i++
          if (i > 1) {
            sql += " and "
          }
          sql += "(";
          sql += w;
          sql += ")";
        }
      }
      if (this.#group.length > 0 && this.#select.length > 0) {
        sql += " group by ";
        let i = 0;
        for (const g of this.#group) {
          i++
          if (i > 1) {
            sql += ", "
          }
          sql += "(";
          sql += g.expression;
          sql += ")";
        }
      }
      if (this.#window.length > 0) {
        sql += " window "
        let i = 0;
        for (const { name, window } of this.#window) {
          i++
          if (i > 1) {
            sql += ", ";
          }
          sql += name;
          sql += " as ";
          sql += window;
        }
      }
      if (this.#having.length > 0) {
        sql += " having "
        let i = 0;
        for (const w of this.#having) {
          i++
          if (i > 1) {
            sql += " and "
          }
          sql += "(";
          sql += w;
          sql += ")";
        }
      }
      const order = columns
        .map((r) => r.name != null ? [r.name, r.sort] : [`(${r.expression})`, r.sort])
        .filter(e => e[1] != null)
      if (this.#order.length + order.length > 0) {
        sql += " order by ";
        let k = 0;
        for (const [e, s] of this.#order) {
          k++;
          if (k > 1) {
            sql += ", ";
          }
          sql += e;
          sql += " ";
          sql += s;
        }
        if (this.#order.length > 0 && order.length > 0) {
          sql += ", ";
        }
        let i = 0;
        for (const [e, s] of order) {
          i++;
          if (i > 1) {
            sql += ", ";
          }
          sql += e;
          sql += " ";
          sql += s;
        }
      }
      if (this.#limit != null) {
        sql += " limit ";
        sql += this.#limit.toString();
        if (this.#offset > 0) {
          sql += " offset ";
          sql += this.#offset.toString();
        }
      }
      if (!allowOrdered && (this.#order.length + order.length > 0 || this.#limit != null)) {
        return `select * from (${sql})`;
      }
      return sql;
    });
  }
  #isSelected() {
    return this.#group.length > 0 || this.#select.length > 0 || this.#distinct;
  }
  #isLimited() {
    return this.#limit != null;
  }
  #paren() {
    return new TableBuilder(null, `(${this.toSQL(true)})`, false, { contexts: this.#contexts });
  }
  as(name) {
    return new TableBuilder(name, `(${this.toSQL(true)})`, true, { contexts: this.#contexts });
  }
  where(e) {
    const condition = this.#applyCorrelation(e);
    if (this.#aggregate) {
      this.#rawSQL = undefined;
      this.#having.push(condition);
      return this;
    }
    if (this.#isSelected()) {
      return this.#paren().where(condition);
    }
    this.#rawSQL = undefined;
    this.#where.push(condition);
    return this;
  }
  select(rs) {
    const processed = rs.map((r) => ({
      ...r,
      expression: this.#applyCorrelation(r.expression),
    }));
    if (this.#isSelected()) {
      return this.#paren().select(processed);
    }
    this.#rawSQL = undefined;
    for (const r of processed) {
      this.#select.push(r);
    }
    this.#lastName = null;
    return this;
  }
  groupSelect(grs, rs) {
    const processedGroups = grs.map((r) => ({
      ...r,
      expression: this.#applyCorrelation(r.expression),
    }));
    const processedSelects = rs.map((r) => ({
      ...r,
      expression: this.#applyCorrelation(r.expression),
    }));
    if (this.#isSelected()) {
      return this.#paren().groupSelect(processedGroups, processedSelects);
    }
    this.#rawSQL = undefined;
    this.#aggregate = true;
    for (const r of processedGroups) {
      this.#group.push(r);
    }
    for (const r of processedSelects) {
      this.#select.push(r);
    }
    this.#lastName = null;
    return this;
  }
  window(w) {
    const processed = {
      ...w,
      window: this.#applyCorrelation(w.window),
    };
    if (this.#isSelected()) {
      return this.#paren().window(processed);
    }
    this.#rawSQL = undefined;
    this.#window.push(processed);
    return this;
  }
  join(tr, on, d) {
    const joinExpression = this.#applyCorrelation(tr.expression);
    let onCondition = on != null ? this.#applyCorrelation(on) : null;
    if (
      tr.correlate &&
      d !== "natural" &&
      d !== "cross" &&
      Array.isArray(this.#contexts) &&
      this.#contexts.length > 0
    ) {
      const baseAlias = tr.name ?? (tr.relation ? tr.relation.table : null);
      const correlateAlias = baseAlias ?? tr.correlate.table;
      const correlatePayload = [
        tr.correlate.schema ?? null,
        tr.correlate.table,
        correlateAlias,
      ];
      const correlateCondition = this.#applyCorrelation(
        `\u0000^${JSON.stringify(correlatePayload)}\u0000`,
      );
      if (onCondition) {
        onCondition = `(${onCondition}) and (${correlateCondition})`;
      } else {
        onCondition = correlateCondition;
      }
    }
    if (this.#isSelected()) {
      return this.#paren().join(
        {
          name: tr.name,
          rename: tr.rename,
          expression: joinExpression,
          relation: tr.relation,
          correlate: tr.correlate,
        },
        onCondition,
        d,
      );
    }
    const j = { name: tr.name, rename: tr.rename, expression: joinExpression, direction: d };
    if (onCondition) {
      j.on = onCondition;
    }
    this.#rawSQL = undefined;
    this.#lastName = j.name;
    this.#join.push(j);
    if (tr.relation) {
      const alias = tr.name ?? tr.relation.table;
      this.#registerContext(tr.relation.schema ?? null, tr.relation.table, alias);
    }
    return this;
  }
  joinUsing(tr, u, d) {
    const joinExpression = this.#applyCorrelation(tr.expression);
    if (this.#isSelected()) {
      return this.#paren().joinUsing(
        {
          name: tr.name,
          rename: tr.rename,
          expression: joinExpression,
          relation: tr.relation,
          correlate: tr.correlate,
        },
        u,
        d,
      );
    }
    const j = { name: tr.name, rename: tr.rename, expression: joinExpression, direction: d };
    j.using = u;
    this.#rawSQL = undefined;
    this.#lastName = j.name;
    this.#join.push(j);
    if (tr.relation) {
      const alias = tr.name ?? tr.relation.table;
      this.#registerContext(tr.relation.schema ?? null, tr.relation.table, alias);
    }
    return this;
  }
  sugarJoin(nl, nr, tr, dw) {
    const tlname = this.#lastName ?? "_l_";
    const trname = tr.name ?? `_r${this.#join.length + 1}_`;
    const trrename = (tr.name == null) || tr.rename;
    return ((this.#lastName == null) ? this.as("_l_") : this)
      .join({ name: trname, rename: trrename, expression: tr.expression }, `${tlname}.${nl} = ${trname}.${nr ?? nl}`, dw);
  }
  distinct(distinct) {
    if (distinct) {
      if (this.#isLimited()) {
        return this.#paren().distinct(distinct);
      }
      this.#rawSQL = undefined;
      this.#distinct = true;
    }
    return this;
  }
  orderBy(order) {
    const processed = order.map(([e, s]) => [this.#applyCorrelation(e), s]);
    if (this.#isLimited()) {
      return this.#paren().orderBy(processed);
    }
    this.#rawSQL = undefined;
    this.#order = [...processed, ...this.#order];
    return this;
  }
  limitOffset(limit, offset) {
    const processedLimit = limit != null ? this.#applyCorrelation(limit) : limit;
    const processedOffset = offset != null ? this.#applyCorrelation(offset) : offset;
    if (this.#isLimited()) {
      return this.#paren().limitOffset(processedLimit, processedOffset);
    }
    this.#rawSQL = undefined;
    this.#limit = processedLimit;
    this.#offset = processedOffset;
    return this;
  }
  rawSQL(sql) {
    this.#rawSQL = this.#applyCorrelation(sql);
    return this;
  }
}

/**
 * 
 * @param {string[]} path 
 * @returns 
 */
function moduleNameMangling(path) {
  return path.map((name) => unquoteSQLName(name)).join("::")
}

/**
 * 
 * @param {string[]} path 
 * @returns 
 */
export function modulePathNameToName(path) {
  return moduleNameMangling(path);
}

/**
 * 
 * @param {string[]} path 
 * @returns 
 */
export function modulePathNameToSQLName(path) {
  if (path.length === 1) {
    return path[0];
  }
  return quoteSQLName(moduleNameMangling(path));
}

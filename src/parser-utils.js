import mergeWith from "lodash.mergewith";

import { keywords } from "./keywords.js";

export function merge(x, ...args) {
  return mergeWith(x, ...args, (a, b) => {
    if (Array.isArray(a)) {
      return a.concat(b);
    }
  });
}

export const patName = "[\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}][\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}\\p{Mc}\\p{Nd}\\p{Pc}\\p{Cf}]*";
export const patQuot = "(?<![\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}\\p{Mc}\\p{Nd}\\p{Pc}\\p{Cf}])`[^`]*`";
export const patPart = "(?<![\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}\\p{Mc}\\p{Nd}\\p{Pc}\\p{Cf}])`[^`]*";
export const reName = new RegExp(`^${patName}$`, "u");
export const reFQNamePart = new RegExp(`(?:(?:${patName}|${patQuot})\\.){0,2}(?:${patName}|${patQuot}|${patPart})?$`, "u");
export const reIdent = /^[_\p{Lu}\p{Ll}\p{Lt}\p{Lm}\p{Lo}\p{Nl}][\p{Lu}\p{Ll}\p{Lt}\p{Lm}\p{Lo}\p{Nl}\p{Mc}\p{Nd}\p{Pc}\p{Cf}]*$/u;

/**
 * Parse dot-separated name like `t.c` or `s.t.c`.
 * Used as `m = reParseColumnName.exec(q);`.
 * `m[1]`: schema or table name.
 * `m[2]`: table name if schema name is specified.
 * `m[3]`: column name.
 */
export const reParseColumnName = new RegExp(`^(${patName}|${patQuot})(?:\\.(${patName}|${patQuot}))?\\.(${patName}|${patQuot}|${patPart})?$`, "u");

export function quoteSQLName(name) {
  if (!reName.test(name)) {
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
  constructor(name, expression, rename = name != null) {
    this.#name = this.#lastName = name;
    this.#expression = expression;
    this.#rename = rename;
  }
  toSQL(allowOrdered = false) {
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
  }
  #isSelected() {
    return this.#group.length > 0 || this.#select.length > 0 || this.#distinct;
  }
  #isLimited() {
    return this.#limit != null;
  }
  #paren() {
    return new TableBuilder(null, `(${this.toSQL(true)})`);
  }
  as(name) {
    return new TableBuilder(name, `(${this.toSQL(true)})`);
  }
  where(e) {
    if (this.#aggregate) {
      this.#rawSQL = undefined;
      this.#having.push(e);
      return this;
    }
    if (this.#isSelected()) {
      return this.#paren().where(e);
    }
    this.#rawSQL = undefined;
    this.#where.push(e);
    return this;
  }
  select(rs) {
    if (this.#isSelected()) {
      return this.#paren().select(rs);
    }
    this.#rawSQL = undefined;
    for (const r of rs) {
      this.#select.push(r);
    }
    this.#lastName = null;
    return this;
  }
  groupSelect(grs, rs) {
    if (this.#isSelected()) {
      return this.#paren().groupSelect(grs, rs);
    }
    this.#rawSQL = undefined;
    this.#aggregate = true;
    for (const r of grs) {
      this.#group.push(r);
    }
    for (const r of rs) {
      this.#select.push(r);
    }
    this.#lastName = null;
    return this;
  }
  window(w) {
    if (this.#isSelected()) {
      return this.#paren().window(w);
    }
    this.#rawSQL = undefined;
    this.#window.push(w);
    return this;
  }
  join(tr, on, d) {
    if (this.#isSelected()) {
      return this.#paren().join(tr, on, d);
    }
    const j = { name: tr.name, rename: tr.rename, expression: tr.expression, direction: d };
    if (on) {
      j.on = on;
    }
    this.#rawSQL = undefined;
    this.#lastName = j.name;
    this.#join.push(j);
    return this;
  }
  joinUsing(tr, u, d) {
    if (this.#isSelected()) {
      return this.#paren().joinUsing(tr, u, d);
    }
    const j = { name: tr.name, rename: tr.rename, expression: tr.expression, direction: d };
    j.using = u;
    this.#rawSQL = undefined;
    this.#lastName = j.name;
    this.#join.push(j);
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
    if (this.#isLimited()) {
      return this.#paren().orderBy(order);
    }
    this.#rawSQL = undefined;
    this.#order = [...order, ...this.#order];
    return this;
  }
  limitOffset(limit, offset) {
    if (this.#isLimited()) {
      return this.#paren().limitOffset(limit, offset);
    }
    this.#rawSQL = undefined;
    this.#limit = limit;
    this.#offset = offset;
    return this;
  }
  rawSQL(sql) {
    this.#rawSQL = sql;
    return this;
  }
}

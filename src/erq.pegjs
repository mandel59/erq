{{

const mergeWith = require("lodash.mergewith");

function merge(x, ...args) {
  return mergeWith(x, ...args, (a, b) => {
    if (Array.isArray(a)) {
      return a.concat(b);
    }
  });
}

function quote(value) {
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

const patName = "[\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}][\\p{Lu}\\p{Ll}\\p{Lt}\\p{Lm}\\p{Lo}\\p{Nl}\\p{Mc}\\p{Nd}\\p{Pc}\\p{Cf}]*"
const reName = new RegExp(`^${patName}$`, "u");

function quoteSQLName(name) {
  if (!reName.test(name)) {
    if (name.includes("\u0000")) {
      throw new RangeError("SQL name cannot contain NUL character");
    }
    return `\`${name.replace(/`/g, "``")}\``;
  }
  return name;
}

function unquoteSQLName(quot) {
  if (quot[0] === "`") {
    if (quot[quot.length - 1] === "`") {
      return quot.substring(1, quot.length - 1).replace(/``/g, "`");
    }
    return quot.substring(1).replace(/``/g, "`");
  }
  return quot;
}

function parseSQLStringLiteral(l) {
  return l.substring(1, l.length - 1).replace(/''/g, "'");
}

function intoSQLIdentifier(n) {
  if (keywords.has(n.toUpperCase())) {
    return `\`${n}\``;
  }
  return n;
}

function parseEscapedStringBody(b) {
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
    if (s.startsWith("\\u{"/*}*/)) return String.fromCodePoint(parseInt(s.substring(3, s.length - 1), 16));
    if (s.startsWith("\\u")) return String.fromCodePoint(parseInt(s.substring(2), 16));
    return s;
  });
}

function escapeVegaField(f) {
  return f.replace(/[\[\]\\.]/g, "\\$&");
}

const keywords = new Set([
  "ABORT",
  "ACTION",
  "ADD",
  "AFTER",
  "ALL",
  "ALTER",
  "ALWAYS",
  "ANALYZE",
  "AND",
  "AS",
  "ASC",
  "ATTACH",
  "AUTOINCREMENT",
  "BEFORE",
  "BEGIN",
  "BETWEEN",
  "BY",
  "CASCADE",
  "CASE",
  "CAST",
  "CHECK",
  "COLLATE",
  "COLUMN",
  "COMMIT",
  "CONFLICT",
  "CONSTRAINT",
  "CREATE",
  "CROSS",
  "CURRENT",
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "DATABASE",
  "DEFAULT",
  "DEFERRABLE",
  "DEFERRED",
  "DELETE",
  "DESC",
  "DETACH",
  "DISTINCT",
  "DO",
  "DROP",
  "EACH",
  "ELSE",
  "END",
  "ESCAPE",
  "EXCEPT",
  "EXCLUDE",
  "EXCLUSIVE",
  "EXISTS",
  "EXPLAIN",
  "FAIL",
  "FILTER",
  "FIRST",
  "FOLLOWING",
  "FOR",
  "FOREIGN",
  "FROM",
  "FULL",
  "GENERATED",
  "GLOB",
  "GROUP",
  "GROUPS",
  "HAVING",
  "IF",
  "IGNORE",
  "IMMEDIATE",
  "IN",
  "INDEX",
  "INDEXED",
  "INITIALLY",
  "INNER",
  "INSERT",
  "INSTEAD",
  "INTERSECT",
  "INTO",
  "IS",
  "ISNULL",
  "JOIN",
  "KEY",
  "LAST",
  "LEFT",
  "LIKE",
  "LIMIT",
  "MATCH",
  "MATERIALIZED",
  "NATURAL",
  "NO",
  "NOT",
  "NOTHING",
  "NOTNULL",
  "NULL",
  "NULLS",
  "OF",
  "OFFSET",
  "ON",
  "OR",
  "ORDER",
  "OTHERS",
  "OUTER",
  "OVER",
  "PARTITION",
  "PLAN",
  "PRAGMA",
  "PRECEDING",
  "PRIMARY",
  "QUERY",
  "RAISE",
  "RANGE",
  "RECURSIVE",
  "REFERENCES",
  "REGEXP",
  "REINDEX",
  "RELEASE",
  "RENAME",
  "REPLACE",
  "RESTRICT",
  "RETURNING",
  "RIGHT",
  "ROLLBACK",
  "ROW",
  "ROWS",
  "SAVEPOINT",
  "SELECT",
  "SET",
  "TABLE",
  "TEMP",
  "TEMPORARY",
  "THEN",
  "TIES",
  "TO",
  "TRANSACTION",
  "TRIGGER",
  "UNBOUNDED",
  "UNION",
  "UNIQUE",
  "UPDATE",
  "USING",
  "VACUUM",
  "VALUES",
  "VIEW",
  "VIRTUAL",
  "WHEN",
  "WHERE",
  "WINDOW",
  "WITH",
  "WITHOUT",
]);

const reIdent = /^[_\p{Lu}\p{Ll}\p{Lt}\p{Lm}\p{Lo}\p{Nl}][\p{Lu}\p{Ll}\p{Lt}\p{Lm}\p{Lo}\p{Nl}\p{Mc}\p{Nd}\p{Pc}\p{Cf}]*$/u;

class TableBuilder {
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
      for (const {name, window} of this.#window) {
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
    return this.#group.length > 0 || this.#select.length > 0;
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
    this.#rawSQL = undefined;
    if (this.#aggregate) {
      this.#having.push(e);
    } else {
      this.#where.push(e);
    }
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

}}

start = _ s:Statement _ { return s; };

cli_readline
  = c:CLICommand { return [c]; }
  / _ ss:(s:Statement? _ ";;" _ { return s; })* { return ss.filter(s => s != null); };

CLICommand
  = "." c:$([_0-9A-Za-z]*) space* args:(
    a:(
      ("'" xs:[^']* "'" { return xs.join(""); }
      / '"' xs:(
        "\\" x:. { if (x === "\n") { return ""; } else { return x; } }
        / x:[^"] { return x; })* '"' { return xs.join(""); }
      / !space x:[^'"] { return x; }
      )+ ) space*
      { return a.join(""); })*
  { return { type: "command", command: c, args }; }

Statement
  = MetaStatement
  / "explain" __ "query" __ "plan" boundary _ s:Statement1 { return { type: "select", format: "eqp", query: `explain query plan ${s.query}` }; }
  / "explain" boundary _ s:Statement1 { return { type: "select", query: `explain ${s.query}` }; }
  / IfStatement
  / ForStatement
  / Statement1

MetaStatement
  = l:LoadRawBlock { return { type: "command", command: "meta-load", args: l }}
  / c:CreateFunction { return { type: "command", command: "meta-create-function", args:c } }
  / c:CreateTableFromJson { return { type: "command", command: "meta-create-table-from-json", args:c } }
  / f:SetOutputFormat { return { type: "command", command: "meta-set-output", args:[f] } }

IfStatement
  = "if" _ "(" _ e:Expression _ ")" _ t:BlockStatement _ "else" _ f:BlockStatement
    { return { type: "if", condition: e, thenStatements: t, elseStatements: f }; }
  / "if" _ "(" _ e:Expression _ ")" _ t:BlockStatement
    { return { type: "if", condition: e, thenStatements: t }; }

ForStatement
  = "for" _ a:ForVarAssignments _ boundary "of" boundary _ t:Table _ boundary ("do" boundary _)? body:BlockStatement
  {
    return {
      type: "for",
      assignments: a,
      sourceTable: t,
      bodyStatements: body,
    };
  }

ForEachClause
  = _ "foreach" _ "(" _ a:ForVarAssignments _ ")" _ body:BlockStatement
  {
    return {
      assignments: a,
      bodyStatements: body,
    };
  }

ForVarAssignments
  = ForVarAssignment|.., _ "," _|

ForVarAssignment
  = v:Variable _ "=" _ e:Expression { return { variable: v, name: intoSQLIdentifier(v.slice(1)), expression: e }; }
  / v:Variable { return { variable: v, name: intoSQLIdentifier(v.slice(1)) }; }

Variable
  = $("@" Identifier)

BlockStatement
  = s:Statement { return [s]; }
  / "(" ss:Statement|1.., _ ";;" _| _ ";;" _ ")" { return ss; }

Statement1
  = s:Attach { return { type: "attach", query: s }; }
  / s:Detach { return { type: "detach", query: s }; }
  / c:Create { return { type: "create", query: c }; }
  / a:Alter { return { type: "alter", query: a }; }
  / d:Drop { return { type: "drop", query: d }; }
  / d:Truncate { return { type: "delete", query: d }; }
  / s:Vacuum { return { type: "vacuum", query: s }; }
  / s:Pragma { return { type: "pragma", query: s }; }
  / s:Begin { return { type: "begin", query: s }; }
  / s:Savepoint { return { type: "savepoint", query: s }; }
  / s:Release { return { type: "release", query: s }; }
  / s:Commit { return { type: "commit", query: s }; }
  / s:Rollback { return { type: "rollback", query: s }; }
  / s:Analyze { return { type: "analyze", query: s }; }
  / t:Table f:ForEachClause { return { type: "for", sourceTable: t, ...f }; }
  / t:TriggerStatement f:FormattingClause? { return f ? { ...t, format: f } : t; }

SetOutputFormat
  = "set" __ "format" __ f:(
    "dense"
    / "sparse"
    / "array" { return "dense"; }
    / "object" { return "sparse"; }
    / Vega
  ) { return f; }

FormattingClause
  = _ boundary "output" __ f:(
    "dense"
    / "sparse"
    / "array" { return "dense"; }
    / "object" { return "sparse"; }
    / "raw"
    / Vega
  ) { return f; }

Vega
  = "vega" __ ("lite" __)? s:(s:("spec" / "svg") __ { return s; })? ("with" __)? v:VegaView {
    return {
      "type": "vega",
      "view": v,
      "format": s,
    };
  }

VegaView
  = opts:VegaViewOption|1.., _ "," _| {
    return merge(...opts);
  }

VegaViewOption
  = VegaRepeat
  / VegaFacet
  / VegaCompose
  / VegaResolve
  / VegaMark
  / VegaEncoding
  / VegaTransform
  / VegaProjection
  / VegaViewJsonOption

VegaMark
  = "mark" __ m:Name
    props:(_ props:JSONObject { return props; })?
    { return { mark: { type: m, ...props } }; }

VegaEncoding
  = "encoding" _ "{" _ cs:VegaEncodingChannel|.., _ "," _| _ "}" {
    return { encoding: Object.fromEntries(cs) };
  }

VegaRepeat
  = "repeat" boundary _ d:VegaRepeatDefVars _ "(" _ v:VegaView _ ")"
    { return { repeat: d, spec: v }; }
  / "repeat" boundary _ d:VegaRepeatDef _ n:VegaRepeatColumns? "(" _ v:VegaView _ ")"
    { return { repeat: d, spec: v, columns: n }; }

VegaRepeatColumns
  = "columns" _ n:JSONNumber _ { return n; }

VegaCompose
  = op:("layer" / "hconcat" / "vconcat" / "concat") _ "(" _ vs:VegaView|.., _ ";" _| _ ")"
    { return { [op]: vs }; }
  / "concat" __ "columns" __ n:JSONNumber _ "(" _ vs:VegaView|.., _ ";" _| _ ")"
    { return { concat: vs, columns: n }; }

VegaFacet
  = "facet" __ "columns" __ n:JSONNumber __ "{" _ def:FacetFieldDef _ "}" _ "(" _ spec:VegaView _ ")"
    { return { facet: def, columns: n, spec }; }
  / "facet" _ "{" _ axes:FacetAxis|1.., _ "," _| _ "}" _ "(" _ spec:VegaView _ ")"
    { return { facet: merge(...axes), spec }; }

FacetAxis
  = d:("row" / "column") _ ":" _ def:FacetFieldDef { return { [d]: def }; }

FacetFieldDef
  = f:VegaField? os:VegaFieldOptions jos:(_ j:JSONObject { return j; })? {
    return {
      ...(f ? { field: f.field } : {}),
      ...Object.fromEntries(os),
      ...jos,
    };
  }

VegaFieldOptions
  = _ os:VegaFieldOption|.., __| { return os; }

VegaFieldOption
  = VegaMeasurementType
  / VegaTimeUnitOption
  / VegaBinning

VegaResolve
  = "resolve" __
    b:("scale" / "axis" / "legend") __
    c:Name __
    d:("independent" / "shared")
    { return { resolve: { [b]: { [c]: d } } }; }

VegaRepeatDefVars
  = ds:VegaRepeatDefVar|1.., _ "repeat" boundary _| { return merge(...ds); }

VegaRepeatDefVar
  = dir:("row" / "column" / "layer")
      _ "(" _ fs:VegaField|1.., _ "," _| _ ")" {
      return { [dir]: fs.map(f => f.field) };
    }

VegaRepeatDef
  = "(" _ fs:VegaField|1.., _ "," _| _ ")" {
      return fs.map(f => f.field);
    }

VegaViewJsonOption
  = "options" _ obj:JSONObject {
    return obj;
  }

VegaEncodingChannel
  = c:Name _ ":" _ f:(
      VegaDatum
      / VegaValueEncoding
      / VegaRepeatField
      / a:VegaAggregatedField { return { aggregate: a.op, field: a.field } }
      / VegaField)?
      os:VegaChannelOptions
      jos:(_ j:JSONObject { return j; })? {
    return [unquoteSQLName(c), {
      ...f,
      ...Object.fromEntries(os),
      ...jos,
    }];
  }

VegaChannelOptions
  = _ os:VegaChannelOption|.., __| { return os; }

VegaChannelOption
  = VegaMeasurementType
  / VegaTimeUnitOption
  / VegaSorting
  / VegaBinning

VegaMeasurementType
  = "quantitative" boundary { return ["type", "quantitative"]; }
  / "q" boundary { return ["type", "quantitative"]; }
  / "nominal" boundary { return ["type", "nominal"]; }
  / "n" boundary { return ["type", "nominal"]; }
  / "ordinal" boundary { return ["type", "ordinal"]; }
  / "o" boundary { return ["type", "ordinal"]; }
  / "temporal" boundary { return ["type", "temporal"]; }
  / "t" boundary { return ["type", "temporal"]; }
  / "geojson" boundary { return ["type", "geojson"]; }
  / "g" boundary { return ["type", "geojson"]; }

VegaTimeUnitOption
  = t:VegaTimeUnit { return ["timeUnit", t]; }

VegaTimeUnit
  = binned:"binned"?
    utc:"utc"?
    us:VegaTimeUnitComponent|1..|
    boundary
    {
      const options = [];
      if (binned) { options.push("binned"); }
      if (utc) { options.push("utc"); }
      options.push(...us);
      return options.join("");
    }

VegaTimeUnitComponent
  = "year"
  / "quarter"
  / "month"
  / "date"
  / "week"
  / "dayofyear"
  / "day"
  / "hours"
  / "minutes"
  / "seconds"
  / "milliseconds"

VegaSorting
  = "sort" _ "(" _ ("channel" / "chan") __ c:Name _ o:(
      "asc" { return "ascending"; }
      / "desc" { return "descending"; }
    ) _ ")" { return ["sort", { encoding: c, order: o }] }
  / "sort" _ "(" _ f:(VegaRepeatField / VegaAggregatedField / VegaField) _ o:(
      "asc" { return "ascending"; }
      / "desc" { return "descending"; }
    ) _ ")" { return ["sort", { ...f, order: o }] }
  / "sort" _ "[" _ vs:(ParsedStringLiteral / JSONValue)|.., _ "," _| "]" { return ["sort", vs]; }
  / "asc" boundary { return ["sort", "ascending"]; }
  / "desc" boundary { return ["sort", "descending"]; }
  / "nosort" boundary { return ["sort", null]; }

VegaBinning
  = "binned" { return ["bin", "binned"]; }
  / "bin" { return ["bin", true]; }

VegaAggregatedField
  = "count" _ "(" _ ("*" _)? ")" { return { op: "count" }; }
  / op:Name _ "(" _ f:VegaField _ ")" {
    return {
      op: unquoteSQLName(op),
      field: f.field,
    };
  }

VegaDatum
  = "datum" _ "(" _ v:("row" / "column" / "layer" / "repeat") _ ")"
    { return { datum: { repeat: v } }; }
  / "datum" _ "(" _ v:(ParsedStringLiteral / JSONValue) _ ")"
    { return { datum: v }; }

VegaValueEncoding
  = "value" _ "(" _ v:(ParsedStringLiteral / JSONValue) _ ")"
    { return { value: v }; }

VegaRepeatField
  = "repeat" _ "(" _ v:("row" / "column" / "layer" / "repeat") _ ")"
    { return { field: { repeat: v } }; }
  / "repeat" boundary { return { field: { repeat: "repeat" } }; }

VegaField
  = f:Name { return { field: escapeVegaField(unquoteSQLName(f)) }; }

VegaTransform
  = "transform" _ ms:VegaTransformMethod|1.., _|
    { return { transform: [].concat(...ms) }; }

VegaTransformMethod
  = "[" _ filter:VegaPredicate _ "]" { return [{ filter }]; }
  / "[" _ e:VegaExpression _ "]" { return [{ filter: e }]; }
  / "{" _ cs:VegaCalculateField|1.., _ "," _| _ "}" { return cs; }
  / "apply" _ obj:JSONObject { return [obj]; }

VegaPredicate
  = ps:VegaPredicate1|2.., _ "or" _|
    { return {"or": ps}; }
  / VegaPredicate1

VegaPredicate1
  = ps:VegaPredicate2|2.., _ "and" _|
    { return {"and": ps}; }
  / VegaPredicate2

VegaPredicate2
  = "not" boundary _ p:VegaPredicate2 { return {"not": p}; }
  / VegaPredicate3

VegaPredicate3
  = "(" _ p:VegaPredicate _ ")" { return p; }
  / "valid" _ "(" _ f:Name _ ")"
    { return { field: escapeVegaField(unquoteSQLName(f)), valid: true }; }
  / f:Name _ "in" _ "[" _ vs:(EscapedString / JSONValue)|.., _ "," _| _ "]"
    { return { field: escapeVegaField(unquoteSQLName(f)), oneOf: vs }; }
  / f:Name _ t:VegaTimeUnit _ "in" _ "[" _ vs:(EscapedString / JSONValue)|.., _ "," _| _ "]"
    { return { field: escapeVegaField(unquoteSQLName(f)), timeUnit: t, oneOf: vs }; }
  / f:Name _ "between" boundary _ a:VegaValue _ "and" boundary _ b:VegaValue
    { return { field: escapeVegaField(unquoteSQLName(f)), range: [a, b] }; }
  / f:Name _ t:VegaTimeUnit _ "between" boundary _ a:VegaValue _ "and" boundary _ b:VegaValue
    { return { field: escapeVegaField(unquoteSQLName(f)), timeUnit: t, range: [a, b] }; }
  / f:Name _ ("<>"/"!=") _ value:VegaValue
    { return { not: { field: escapeVegaField(unquoteSQLName(f)), equal: value } }; }
  / f:Name _ op:VegaCompareOperator _ value:VegaValue
    { return { field: escapeVegaField(unquoteSQLName(f)), [op]: value }; }
  / f:Name _ t:VegaTimeUnit _ ("<>"/"!=") _ value:VegaValue
    { return { not: { field: escapeVegaField(unquoteSQLName(f)), timeUnit: t, [op]: value } }; }
  / f:Name _ t:VegaTimeUnit _ op:VegaCompareOperator _ value:VegaValue
    { return { field: escapeVegaField(unquoteSQLName(f)), timeUnit: t, [op]: value }; }

VegaCalculateField
  = f:Name _ ":" _ e:VegaExpression { return { calculate: e, as: escapeVegaField(unquoteSQLName(f)) }; }

VegaCompareOperator
  = "=" { return "equal"; }
  / "<=" { return "lte"; }
  / ">=" { return "gte"; }
  / "<" { return "lt"; }
  / ">" { return "gt"; }

VegaValue
  = v:EscapedString &(_ !VegaExpressionBinOp) { return v; }
  / v:JSONValue &(_ !VegaExpressionBinOp) { return v; }
  / e:VegaExpression3 { return { expr: e }; }

VegaExpression
  = es:VegaExpression0|2.., _ "or" _|
    { return es.join(" || "); }
  / VegaExpression0

VegaExpression0
  = es:VegaExpression1|2.., _ "and" _|
    { return es.join(" && "); }
  / VegaExpression1

VegaExpression1
  = "not" boundary _ e:VegaExpression2
    { return `!(${e})`; }
  / VegaExpression2

VegaExpression2
  = e:VegaExpression3 _ "between" boundary _ e1:VegaExpression3 _ "and" boundary _ e2:VegaExpression3
    { return `${e} >= ${e1} && ${e} <= ${e2}`; }
  / VegaExpression3

VegaExpression3
  = e1:VegaExpression4 _ op:VegaExpressionBinOp _ e2:VegaExpression3
    { return `${e1} ${op} ${e2}`; }
  / VegaExpression4

VegaExpressionBinOp
  = "==" { return "==="; }
  / "!=" { return "!=="; }
  / ">>>"
  / ">>"
  / ">="
  / "<="
  / "<>" { return "!=="; }
  / "=" { return "==="; }
  / "||" { return "+"; }
  / [-+*/%|^&<>]

VegaExpression4
  = !("--"/"++") op:[-~+!] _ e:VegaExpressionValue { return `${op}${e}`; }
  / VegaExpressionValue

VegaExpressionValue
  = "(" _ e:VegaExpression _ ")" { return `(${e})`; }
  / f:$([A-Za-z_][A-Za-z0-9_]*) _ "(" _ es:VegaExpression|.., _ "," _| _ ")"
    { return `${f}(${es.join(", ")})`; }
  / "datum" _ "." _ f:Name { return `datum[${JSON.stringify(unquoteSQLName(f))}]`; }
  / "event" _ "." _ f:Name { return `event[${JSON.stringify(unquoteSQLName(f))}]`; }
  / s:ParsedStringLiteral { return JSON.stringify(s); }
  / v:JSONValue { return JSON.stringify(v); }
  / VegaConstant
  / f:Name { return `datum[${JSON.stringify(unquoteSQLName(f))}]`; }

VegaConstant
  = "NaN" boundary { return "NaN"; }
  / "E" boundary { return "E"; }
  / "LN2" boundary { return "LN2"; }
  / "LN10" boundary { return "LN10"; }
  / "LOG2E" boundary { return "LOG2E"; }
  / "MAX_VALUE" boundary { return "MAX_VALUE"; }
  / "MIN_VALUE" boundary { return "MIN_VALUE"; }
  / "PI" boundary { return "PI"; }
  / "SQRT1_2" boundary { return "SQRT1_2"; }
  / "SQRT2" boundary { return "SQRT2"; }

VegaProjection
  = "projection" __ type:Name opts:(__ opts:JSONObject { return opts; })?
  {
    return {
      projection: {
        type,
        ...opts,
      },
    };
  }

TriggerStatement
  = i:Insert r:ReturningClause? { return r != null ? { type: "insert", query: i + r, returning: true } : { type: "insert", query: i }; }
  / d:Delete r:ReturningClause? { return r != null ? { type: "delete", query: d + r, returning: true } : { type: "delete", query: d }; }
  / u:Update r:ReturningClause? { return r != null ? { type: "update", query: u + r, returning: true } : { type: "update", query: u }; }
  / t:Table { return { type: "select", query: t }; }

Begin
  = "begin" boundary opt:(_ opt:("deferred"/"immediate"/"exclusive") { return opt; })?
  {
    if (opt != null) {
      return `begin ${opt}`;
    } else {
      return "begin";
    }
  }

Commit
  = "commit"

Savepoint
  = "savepoint" boundary _ n:Name
  { return `savepoint ${n}`; }

Release
  = "release" boundary _ n:Name
  { return `release ${n}`; }

Rollback
  = "rollback" boundary savepoint:(_ "to" boundary n:Name { return n; })?
  {
    if (savepoint != null) {
      return `rollback to ${savepoint}`;
    } else {
      return "rollback";
    }
  }

Analyze
  = "analyze" boundary _ s:Name _ "." _ n:Name { return `analyze ${s}.${n}`; }
  / "analyze" boundary _ n:Name { return `analyze ${n}`; }
  / "analyze" { return "analyze"; }

LoadRawBlock
  = "load" __ "table"
    ifNotExists:(__ "if" __ "not" __ "exists" { return true; })?
    boundary _ table:TableNameWithVariable _ d:("(" _ td:TableDef _ ")" _ { return td; })?
    boundary "from" _ x:(
      RawBlock
      / ParsedStringLiteral
      / v:Variable { return { variable: v }; }
      / "(" e:Expression ")" { return { sql: `select ${e}` }; })
    opt:(_ opt1:LoadOption opts:(_ "," _ o:LoadOption { return o; })* { return [opt1, ...opts]; })?
  {
    const def = d && d.def;
    const columns = d && d.columns.filter(c => !c.constraints.some(({ body }) => body.startsWith("as"))).map(c => c.name);
    const options = Object.fromEntries(opt ?? []);
    const base = {
      ifNotExists,
      table,
      def,
      columns,
      options,
    };
    if (typeof x === "string") {
      const path = typeof x === "string" ? x : null;
      return {
        ...base,
        path,
      };
    } else if ("rawblock" in x) {
      const contentType = x.rawblock[0];
      const content = x.rawblock[1];
      return {
        ...base,
        contentType,
        content,
      };
    } else if ("variable" in x) {
      const variable = x.variable;
      return {
        ...base,
        variable,
      };
    } else if ("sql" in x) {
      const sql = x.sql;
      return {
        ...base,
        sql,
      };
    }
  }

LoadOption
  = "null" boundary _ s:ParsedStringLiteral { return ["null", s]; }
  / "header" { return ["header", true]; }
  / "no" __ "header" { return ["header", false]; }
  / "delimiter" boundary _ s:ParsedStringLiteral { return ["delimiter", s]; }
  / "quote" boundary _ s:ParsedStringLiteral { return ["quote", s]; }
  / "no" __ "quote" { return ["quote", false]; }
  / "escape" boundary _ s:ParsedStringLiteral { return ["escape", s]; }
  / "comment" boundary _ s:ParsedStringLiteral { return ["comment", s]; }
  / "encoding" boundary _ s:ParsedStringLiteral { return ["encoding", s]; }
  / "relax" __ "column" __ "count" __ lm:("less"/"more") { return ["relax_column_count_" + lm, true]; }
  / "relax" __ "column" __ "count" { return ["relax_column_count", true]; }
  / "sniff" __ "size" boundary _ n:JSONNumber { return ["sniff_size", n]; }
  / ("format" __)? f:("csv"/"ndjson") { return ["format", f]; }

CreateFunction
  = "create" __ "function" boundary _ n:Name _ ps:FunctionParams _ "as" _ x:RawBlock
  {
    return [n, ps, x];
  }

CreateTableFromJson
  = "create" __ "table"
    ine:(__ "if" __ "not" __ "exists")? boundary _
    table:TableNameWithVariable _ d:("(" _ td:TableDef _ ")" _ { return td; })?
    boundary "from" __ "json" _ "(" _ e:Table _ ")" { return [table, d, e, Boolean(ine)]; }

FunctionParams
  = "(" _ ")" { return []; }
  / "(" _ n1:Identifier ns:(_ "," _ n:Identifier { return n; })* _ ")" { return [n1, ...ns]; }

TableDef
  = c1:ColumnDef cs:(_ "," _ c:ColumnDef { return c; })* cos:(_ "," _ c:TableConstraint { return c; })*
  {
    let def = c1.def;
    for (const c of cs) def += `, ${c.def}`;
    for (const co of cos) def += `, ${co.def}`;
    return { def, columns: [c1, ...cs], constraints: cos };
  }

ColumnDef
  = !("primary" __ "key" / "unique" / "check" / "foreign" __ "key") name:Name type:(_ t:TypeName { return t; })? constraints:(_ c:ColumnConstraint { return c; })*
  {
    let def = name;
    if (type) def += ` ${type}`;
    for (const c of constraints) def += ` ${c.def}`
    return { def, name, type, constraints };
  }

ColumnConstraint
  = name:("constraint" n:Name { return n; })? body:ColumnConstraintBody
  {
    const def = name ? `constraint ${name} ${body}` : body;
    return { def, name, body }
  }

ColumnConstraintBody
  = "primary" __ "key" d:(__ d:("asc"/"desc") { return ` ${d}`; })? boundary cc:ConflictClause? a:(__ "autoincrement" {return " autoincrement"; })? { return `primary key${d ?? ""}${cc ?? ""}${a ?? ""}`; }
  / "not" __ "null" cc:ConflictClause? { return `not null${cc ?? ""}`; }
  / "unique" cc:ConflictClause? { return `unique${cc ?? ""}`; }
  / "check" _ "(" _ e:Expression _ ")" { return `check (${e})`; }
  / "default" _ x:("(" _ e:Expression _ ")" { return `(${e})`; } / Literal / SignedNumber) { return `default ${x}`; }
  / "collate" boundary _ n:Name { return `collate ${n}`; }
  / "as" _ "(" _ e:Expression _ ")" x:(__ x:("stored" / "virtual") { return ` ${x}`; })? { return `as (${e})${x ?? ""}`; }

TableConstraint
  = name:("constraint" n:Name { return n; })? body:TableConstraintBody
  {
    const def = name ? `constraint ${name} ${body}` : body;
    return { def, name, body }
  }

TableConstraintBody
  = k:("primary" __ "key" { return "primary key"; } / "unique") _ cs:ColumnNameList cc:ConflictClause? { return `${k} (${cs.join(", ")})${cc ?? ""}`; }
  / "check" _ "(" _ e:Expression _ ")" { return `check (${e})`; }

ConflictClause
  = __ "on" __ "conflict" __ k:("rollback"/"abort"/"fail"/"ignore"/"replace") { return ` on conflict ${k}`; }

Attach
  = "attach" boundary _ e:Expression _ "as" boundary _ n:Name {
    return `attach ${e} as ${n}`;
  }

Detach
  = "detach" boundary _ n:Name {
    return `detach ${n}`;
  }

Create
  = "create" __ "temporary" __ tv:("table" / "view") ine:(__ "if" __ "not" __ "exists")? boundary _ n:Name _ boundary "as" boundary _ t:Table
  {
    if (ine) {
      return `create temporary ${tv} if not exists ${n} as ${t}`;
    } else {
      return `create temporary ${tv} ${n} as ${t}`;
    }
  }
  / "create" __ tv:("table" / "view") ine:(__ "if" __ "not" __ "exists")? boundary _ n:TableName _ boundary "as" boundary _ t:Table
  {
    if (ine) {
      return `create ${tv} if not exists ${n} as ${t}`;
    } else {
      return `create ${tv} ${n} as ${t}`;
    }
  }
  / "create" __ "index" ine:(__ "if" __ "not" __ "exists")? boundary _ n:TableName _ boundary "on" boundary _ tn:Name _ "(" _ ic:IndexedColumns ")"
  {
    if (ine) {
      return `create index if not exists ${n} on ${tn} (${ic})`;
    } else {
      return `create index ${n} on ${tn} (${ic})`;
    }
  }
  / "create" __ "virtual" __ "table" boundary _ n:TableName _ boundary "using" _ tn:Name _ "(" a:$ModuleArguments ")"
  {
    return `create virtual table ${n} using ${tn}(${a})`;
  }
  / "create" __ "table" ine:(__ "if" __ "not" __ "exists")? boundary _ n:TableName _ "(" _ td:TableDef _ ")"
  {
    if (ine != null) {
      return `create table if not exists ${n} (${td.def})`;
    } else {
      return `create table ${n} (${td.def})`;
    }
  }
  / "create" __ "trigger"
    ine:(__ "if" __ "not" __ "exists" { return " if not exists"; })? boundary
    _ trig:TableName
    _ boundary triggerPhase:("before"/"after"/"instead" __ "of" { return "instead of"; })
    __ triggerMethod:("delete"/"insert"/"update" __ "of" __ cns:NameList { return `update of ${cns.join(", ")}`; })
    _ boundary "on" boundary _ tn:Name when:(_ "when" _ when:Expression { return ` when ${when}`; })?
    _ ss:BlockTriggerStatement
  {
    return `create trigger${ine ?? ""} ${trig} ${triggerPhase} ${triggerMethod} on ${tn}${when ?? ""} begin ${ss.map(s => `${s.query};`).join("")} end`;
  }
  / tv:("table" / "view") boundary _ x:TableName1 _ a:ColumnNameList? "=" _ t:Table
  {
    const [s, n] = x;
    const qn = s != null ? `${s}.${n}` : n;
    if (a != null) {
      return `create ${tv} ${qn} as with ${n}(${a.join(", ")}) as (${t}) select * from ${n}`;
    } else {
      return `create ${tv} ${qn} as with ${n} as (${t}) select * from ${n}`;
    }
  }

BlockTriggerStatement
  = s:TriggerStatement { return [s]; }
  / "(" ss:TriggerStatement|1.., _ ";;" _| _ ";;" _ ")" { return ss; }

Alter
  = "alter" __ "table" boundary _ n:TableName _ "rename" __ "to" boundary _ d:Name { return `alter table ${n} rename to ${d}`; }
  / "alter" __ "table" boundary _ n:TableName _ "rename" boundary _ c:Name _ boundary "to" boundary _ d:Name { return `alter table ${n} rename ${c} to ${d}`; }
  / "alter" __ "table" boundary _ n:TableName _ "add" boundary _ d:ColumnDef { return `alter table ${n} add ${d.def}`; }
  / "alter" __ "table" boundary _ n:TableName _ "drop" boundary _ c:Name { return `alter table ${n} drop ${c}`; }

Insert
  = ts:WithClause* "insert" __ "into" boundary _ n:TableName _ a:ColumnNameList? t:Table
  {
    const withclause = ts.length > 0 ? "with " + ts.join(", ") + " " : "";
    if (a != null) {
      return `${withclause}insert into ${n} (${a.join(", ")}) ${t}`;
    } else {
      return `${withclause}insert into ${n} ${t}`;
    }
  }
  / ts:WithClause* n:TableName _ a:ColumnNameList? "<-" _ t:Table
  {
    const withclause = ts.length > 0 ? "with " + ts.join(", ") + " " : "";
    if (a != null) {
      return `${withclause}insert into ${n} (${a.join(", ")}) ${t}`;
    } else {
      return `${withclause}insert into ${n} ${t}`;
    }
  }
  ;

Delete
  = ts:WithClause*
    "delete" __ "from" boundary _ n:TableName _
    boundary "where" boundary _ e:Expression
  {
    const withclause = ts.length > 0 ? "with " + ts.join(", ") + " " : "";
    return `${withclause}delete from ${n} where ${e}`;
  }

Update
  = ts:WithClause*
    "update" boundary _ n:TableName cond:(_ "[" _ cond:Expression _ "]" { return cond; })?
    ss:(_ s:SetClause { return s; })*
  {
    const withclause = ts.length > 0 ? "with " + ts.join(", ") + " " : "";
    return `${withclause}update ${n} set ${ss.join(", ")}${cond ? ` where ${cond}` : ""}`
  }

SetClause
  = "set" boundary _ l:UpdateLHS _ "=" _ e:Expression { return `${l} = ${e}`; }

UpdateLHS
  = "{" _ an1:Name ans:(_ "," _ an:Name { return an; })* _ "}" _ { return `(${[an1, ...ans].join(", ")})`; }
  / t:Name

Truncate
  = "truncate" __ "table" boundary _ n:TableName
  { return `delete from ${n}`; }

Vacuum
  = "vacuum" boundary _ n:Name _ boundary "into" boundary s:SQLStringLiteral
  { return `vacuum ${n} into ${s}`; }
  / "vacuum" __ "into" boundary s:SQLStringLiteral
  { return `vacuum into ${s}`; }
  / "vacuum" boundary _ n:Name
  { return `vacuum ${n}`; }
  / "vacuum"
  { return `vacuum`; }

Pragma
  = "pragma" boundary s:(_ s:Name _ "." { return s; })? _ n:Name _ e:(
    "=" _ v:PragmaValue { return `= ${v}`; }
    / "(" _ v:PragmaValue _ ")" { return `(${v})`; }
  )?
  {
    const sn = (s != null) ? `${s}.${n}` : n;
    if (e != null) {
      return `pragma ${sn} ${e}`;
    } else {
      return `pragma ${sn}`;
    }
  }

PragmaValue
  = SignedNumber
  / Name
  / SQLStringLiteral

ReturningClause
  = rs:(_ boundary "returning" _ rs:ValueWildCardReferences { return rs; })
  {
    return " returning " + rs.map(s => {
      if (s.name && s.name !== s.expression) {
        return `${s.expression} as ${s.name}`;
      } else {
        return s.expression;
      }
    }).join(", ");
  }


ModuleArguments
  = "(" ModuleArguments ")"
  / (("'" ("''" / [^'])* "'")+ / [^()'])*

IndexedColumns
  = e1:IndexedColumn _ es:("," _ e:IndexedColumn { return e; })* {
    return [e1, ...es].join(", ");
  }

IndexedColumn
  = e:Expression s1:(_ s:("asc" / "desc") { return s; })? {
    if (s1) {
      return `${e} ${s1}`;
    } else {
      return e;
    }
  }

Drop
  = "drop" __ "temporary" __ tv:("table" / "view") boundary _ n:TableName
  {
    return `drop temporary ${tv} ${n}`;
  }
  / "drop" __ tv:("table" / "view" / "index" / "trigger") ie:(__ "if" __ "exists")? boundary _ n:TableName
  {
    if (ie) {
      return `drop ${tv} if exists ${n}`;
    } else {
      return `drop ${tv} ${n}`;
    }
  }

TableNameWithVariable
  = s:Name _ "." _ v:Variable { return [s, v]; }
  / v:Variable { return [null, v]; }
  / x:TableName1 {
    const [s, n] = x;
    if (s != null) {
      return `${s}.${n}`;
    } else {
      return n;
    }
  }

TableName
  = x:TableName1 {
    const [s, n] = x;
    if (s != null) {
      return `${s}.${n}`;
    } else {
      return n;
    }
  }

TableName1
  = s:MetaTableName _ "." _ n:MetaTableName { return [s, n]; }
  / n:MetaTableName { return [null, n]; }

MetaTableName
  = i:$("@" Identifier) { return `\u0000t${i}\u0000`; }
  / Name

Table
  = WithTable
  / ("from" boundary _)? t:TableUnion { return t; }

WithTable
  = ts:WithClause+
    t:Table {
    return `with ${ts.join(", ")} ${t}`;
  }

WithClause
  = "with" boundary _ n:Name _
    a:ColumnNameList?
    boundary "as" boundary _ "(" _ t:Table _ ")" _
  {
    if (a != null) {
      return `${n}(${a.join(", ")}) as (${t})`;
    }
    return `${n} as (${t})`;
  }

WindowClause
  = "window" boundary _ n:Name _ boundary "as" _ w:WindowDefn
  { return { name: n, window: w }; }

ColumnNameList
  = "(" _ ns:NameList _ ")" _ { return ns; }

NameList
  = an1:Name ans:(_ "," _ an:Name { return an; })* { return [an1, ...ans]; }

TableUnion
  = t1:Table1
    ts:(_ ";" _ t:Table1 { return t; })*
    order:OrderClause?
    distinct:DistinctClause?
    limitOffset:LimitOffsetClause?
    alias:AsClause?
    cs:(
      d:DistinctClause { return ["distinct", true]; }
      / o:OrderClause { return ["orderBy", o]; }
      / l:LimitOffsetClause { return ["limitOffset", l]; }
      / a:AsClause { return ["as", a]; }
      / fs:(_ fs:Filters { return ["filters", fs]; })
    )*
  {
    const union = distinct ? " union " : " union all "
    let sql;
    t1.distinct(distinct);
    if (ts.length === 0) {
      if (order != null) {
        t1 = t1.orderBy(order);
      }
      sql = t1.toSQL(true);
    } else {
      sql = `${t1.toSQL(false)}${union}${ts.map(tb => tb.distinct(distinct).toSQL(false)).join(union)}`;
      if (order) {
        sql += " order by ";
        let k = 0;
        for (const [e, s] of order) {
          k++;
          if (k > 1) {
            sql += ", ";
          }
          sql += e;
          sql += " ";
          sql += s;
        }
      }
    }
    if (limitOffset) {
      const [limit, offset] = limitOffset;
      sql += " limit ";
      sql += limit;
      if (offset != null) {
        sql += " offset ";
        sql += offset;
      }
    }
    if (cs.length > 0) {
      let tb = new TableBuilder(alias ?? null, `(${sql})`);
      for (const [tag, v] of cs) {
        if (tag === "distinct") {
          tb = tb.distinct(v);
        } else if (tag === "orderBy") {
          tb = tb.orderBy(v);
        } else if (tag === "limitOffset") {
          const [limit, offset] = v;
          tb = tb.limitOffset(limit, offset);
        } else if (tag === "as") {
          tb = tb.as(v);
        } else if (tag === "filters") {
          for (const f of v) {
            tb = f(tb)
          }
        }
      }
      sql = tb.toSQL(true);
    }
    return sql;
  }

DistinctClause
  = _ boundary "distinct" boundary { return true; }
  ;

AsClause
  = _ boundary "as" boundary _ n:Name { return n; }
  ;

OrderClause
  = _ boundary "order" __ "by" boundary
    _ e1:Expression s1:(_ s:("asc" / "desc") { return s; })?
    r:(_ "," _ e:Expression s:(_ s:("asc" / "desc") { return s; })? { return [e, s ?? "asc"]; })*
  {
    return [[e1, s1 ?? "asc"], ...r];
  }

LimitOffsetClause
  = _ boundary "limit" boundary _ limit:Expression _ boundary "offset" boundary _ offset:Expression { return [limit, offset]; }
  / _ boundary "limit" boundary _ limit:Expression { return [limit, null]; }
  / _ boundary "offset" boundary _ offset:Expression _ boundary "limit" boundary _ limit:Expression { return [limit, offset]; }

Table1
  = tb:Table2 fs:(_ fs:Filters { return fs; })? {
    if (fs != null) {
      for (const f of fs) {
        tb = f(tb);
      }
    }
    return tb;
  }
  ;

Table2
  = "select" boundary _ rs:ValueReferences {
    return new TableBuilder(null, null).select(rs);
  }
  / "{" _ rs:ValueReferences _ "}" {
    return new TableBuilder(null, null).select(rs);
  }
  / vs:ValuesList {
    return new TableBuilder(null, `(${vs})`).rawSQL(vs);
  }
  / tr:TableReference {
    return new TableBuilder(tr.name, tr.expression, tr.rename);
  }
  ;

ValuesList
  = "values" _ a:ColumnNameList? "[" _ vs:(
      e1:(Record/Expression) es:(_ "," _ e:(Record/Expression) { return e; })* { return [e1, ...es].map(e => `(${e})`).join(", "); }
    ) _ "]"
  {
    const values = "values " + vs;
    if (a != null) {
      return `select ${a.map(c => `null as ${c}`).join(", ")} where 0 union all ${values}`;
    }
    return values;
  }
  / "values" _ a:ColumnNameList "[" _ "]"
  {
    return `select ${a.map(c => `null as ${c}`).join(", ")} where 0`;
  }
  / "values" _ "[" _ jsonarray:JSONObject|.., _ "," _| _ "]"
  {
    const keys = new Set();
    for (const obj of jsonarray) {
      for (const key of Object.keys(obj)) {
        keys.add(key);
      }
    }
    const keyNames = [...keys];
    if (keyNames.length === 0) {
      return `select null where 0`;
    }
    return `select ${
      keyNames.map(c => `null as ${quoteSQLName(c)}`).join(", ")
    } where 0 union all values ${
      jsonarray.map(r => `(${keyNames.map(
        k => Object.hasOwn(r, k) ? quote(r[k]) : "null"
      ).join(", ")})`).join(", ")
    }`;
    return values;
  }
  ;

Record
  = "{" _ vs:Expressions _ "}"
  {
    return vs;
  }

TableReference
  = n:Name _ ":" _ e:TableExpression { return { name: n, expression: e.expression, rename: true }; }
  / e:TableExpression { return { name: e.name, expression: e.expression, rename: false }; }
  ;

Filters
  = f:Filter _ fs:Filters { return [f, ...fs]; }
  / f:Filter { return [f]; }
  ;

Filter
  = "[" _ e:Expression _ "]" {
    return (tb) => tb.where(e);
  }
  / "where" boundary _ e:Expression {
    return (tb) => tb.where(e);
  }
  / "{" _ grs:ValueReferences _ "=>" _ rs:ValueWildCardReferences _ "}" {
    return (tb) => tb.groupSelect(grs, [...grs, ...rs]);
  }
  / "{" _ grs:ValueReferences _ "=>" _ "}" {
    return (tb) => tb.groupSelect(grs, grs);
  }
  / "{" _ "=>" _ grs:ValueReferences  _ "}" {
    return (tb) => tb.groupSelect([], grs);
  }
  / "{" _ rs:ValueWildCardReferences _ "}" {
    return (tb) => tb.select(rs);
  }
  / "group" __ "by" boundary _ grs:ValueReferences _ boundary "select" boundary _ rs:ValueWildCardReferences {
    return (tb) => tb.groupSelect(grs, rs);
  }
  / "select" boundary _ rs:ValueWildCardReferences {
    return (tb) => tb.select(rs);
  }
  / dw:("left" / "right" / "full" / "inner" / "cross") __ "join" boundary _ tr:TableReference _ boundary "using" _ "(" _ u:NameList _ ")" {
    return (tb) => tb.joinUsing(tr, u, dw);
  }
  / dw:("left" / "right" / "full" / "inner" / "cross") __ "join" boundary _ tr:TableReference on:(_ boundary "on" boundary _ e:Expression { return e; })? {
    return (tb) => tb.join(tr, on, dw);
  }
  / "join" boundary _ tr:TableReference _ boundary "using" _ "(" _ u:NameList _ ")" {
    return (tb) => tb.joinUsing(tr, u);
  }
  / "join" boundary _ tr:TableReference on:(_ boundary "on" boundary _ e:Expression { return e; })? {
    return (tb) => tb.join(tr, on);
  }
  / "natural" __ "join" boundary _ tr:TableReference {
    return (tb) => tb.join(tr, null, "natural");
  }
  / dw:("left" / "right" / "full" / "inner" / "cross")? _ "-:" _ nl:Name _ nr:(":" _ nr:Name _ { return nr; })? ":>" _ tr:TableReference {
    return (tb) => tb.sugarJoin(nl, nr, tr, dw);
  }
  / w:WindowClause {
    return (tb) => tb.window(w);
  }
  ;

ValueReferences
  = r1:ValueReferenceOrUnpack rs:(_ "," _ r:ValueReferenceOrUnpack { return r; })* {
    return [r1, ...rs].flat();
  }
  ;

ValueWildCardReferences
  = r1:ValueWildCardReferenceOrUnpack rs:(_ "," _ r:ValueWildCardReferenceOrUnpack { return r; })* {
    return [r1, ...rs].flat();
  }

ValueReference
  = n:Name _ ":" _ e:Expression _ boundary sort:("asc" / "desc") boundary {
    return { name: n, expression: e, sort: sort };
  }
  / n:Name _ ":" _ e:Expression {
    return { name: n, expression: e, sort: null };
  }
  / e:Expression _ boundary sort:("asc" / "desc") boundary {
    return { name: null, expression: e, sort: sort };
  }
  / e:Expression {
    return { name: null, expression: e, sort: null };
  }
  ;

WildCardReference
  = s:Name _ "." _ t:Name _ "." _ "*" { return `${s}.${t}.*`; }
  / t:Name _ "." _ "*" { return `${t}.*`; }
  / "*"

ValueWildCardReference
  = e:WildCardReference {
    return { name: null, expression: e, sort: null };
  }
  / ValueReference
  ;

ValueReferenceOrUnpack
  = Unpack
  / r:ValueReference { return [r]; }
  ;

ValueWildCardReferenceOrUnpack
  = Unpack
  / r:ValueWildCardReference { return [r]; }
  ;

TableExpression
  = "{" _ rs:ValueReferences _ "}" {
    return { name: null, expression: `(${new TableBuilder(null, null).select(rs).toSQL(true)})` };
  }
  / "(" _ t:Table _ ")" { return { name: null, expression: `(${t})` }; }
  / s:Name _ "." _ n:Name _ "(" _ ")" { return { name: n, expression: `${s}.${n}()` }; }
  / s:Name _ "." _ n:Name _ "(" _ es:Expressions _ ")" { return { name: n, expression: `${s}.${n}(${es})` }; }
  / s:Name _ "." _ t:Name { return { name: t, expression: `${s}.${t}` }; }
  / n:Name _ "(" _ ")" { return { name: n, expression: `${n}()` }; }
  / n:Name _ "(" _ es:Expressions _ ")" { return { name: n, expression: `${n}(${es})` }; }
  / n:Name { return { name: n, expression: n } }
  ;

Expressions
  = e:Expression _ "," _ es:Expressions { return `${e}, ${es}`; }
  / Expression
  ;

RowValues
  = e:RowValue _ "," _ es:RowValues { return `${e}, ${es}`; }
  / RowValue
  ;

UnOp
  = "~"
  / "+"
  / "-"
  / "not" boundary { return "not "; }
  ;

BinOp
  = "=="
  / "<="
  / ">="
  / "!="
  / "<<"
  / ">>"
  / "<>"
  / "<"
  / ">"
  / "="
  / "&"
  / "||"
  / "|"
  / "+"
  / "->>"
  / "->"
  / "-"
  / "*"
  / "/"
  / "%"
  / "between" boundary { return "between"; }
  / "and" boundary { return "and"; }
  / "or" boundary { return "or"; }
  / "is" __ "not" boundary { return "is not"; }
  / "is" boundary { return "is"; }
  / "not" __ "glob" boundary { return "not glob"; }
  / "glob" boundary { return "glob"; }
  / "not" __ "like" boundary { return "not like"; }
  / "like" boundary { return "like"; }
  / "not" __ "regexp" boundary { return "not regexp"; }
  / "regexp" boundary { return "regexp"; }
  / "match" boundary { return "match"; }
  / "collate" boundary { return "collate"; }
  ;

BinCompOp
  = "=="
  / "="
  / "<="
  / ">="
  / "<>"
  / "<"
  / ">"
  / "!="
  / "is" __ "not" boundary { return "is not"; }
  / "is" boundary { return "is"; }

Expression
  = e:Expression1OrRowValue _ boundary rest:(
    "not" __ "in" boundary _ t:Table _ op:BinOp _ e2:Expression { return `not in (${t}) ${op} ${e2}` }
    / "not" __ "in" boundary _ t:Table { return `not in (${t})`; }
    / "not" __ "in" _ "[" _ es:RecordOrExpressionList _ "]" _ op:BinOp _ e2:Expression { return `not in (${es}) ${op} ${e2}` }
    / "not" __ "in" _ "[" _ es:RecordOrExpressionList _ "]" { return `not in (${es})`; }
    / "in" boundary _ t:Table _ op:BinOp _ e2:Expression { return `in (${t}) ${op} ${e2}` }
    / "in" boundary _ t:Table { return `in (${t})`; }
    / "in" _ "[" _ es:RecordOrExpressionList _ "]" _ op:BinOp _ e2:Expression { return `in (${es}) ${op} ${e2}` }
    / "in" _ "[" _ es:RecordOrExpressionList _ "]" { return `in (${es})`; }
  ) { return `${e} ${rest}`; }
  / Expression1

CaseExpression
  = "case" boundary _ w:WhenClause+ el:ElseClause? boundary "end" boundary
  {
    let sql = `case `;
    for (const e of w) {
      sql += e;
    }
    if (el != null) {
      sql += el;
    }
    sql += "end";
    return sql;
  }
  / "case" boundary _ ex:ExpressionOrRowValue _ w:WhenClause+ el:ElseClause? boundary "end" boundary
  {
    let sql = `case `;
    sql += ex;
    sql += " ";
    for (const e of w) {
      sql += e;
    }
    if (el != null) {
      sql += el;
    }
    sql += "end";
    return sql;
  }
  / "if" boundary _ c:Expression _ boundary "then" boundary _ e:Expression _ el:ElseClause? boundary "end" boundary
  {
    return `case when ${c} then ${e} ${el ?? ""}end`;
  }

WhenClause
  = "when" boundary _ c:ExpressionOrRowValue _ boundary "then" boundary _ e:Expression _ { return `when ${c} then ${e} `; }

ElseClause
  = "else" boundary _ e:Expression _ { return `else ${e} `; }

ExpressionOrRowValue
  = Expression
  / RowValue

Expression1OrRowValue
  = Expression1
  / RowValue

RecordOrExpressionList
  = e1:RecordOrExpression es:(_ "," _ e:RecordOrExpression { return e; })*
  { return [e1, ...es].join(", "); }

RecordOrExpression
  = r:Record {return `(${r})`}
  / Expression

RowValue
  = "{" _ es:Expressions _ "}" { return `(${es})`; }
  / "from" boundary _ t:Table { return `(${t})`; }
  / v:ValuesList { return `(${v})`; }

Expression1
  = op:UnOp _ e:Expression1 { return `${op}${e}` }
  / r1:RowValue _ op:BinCompOp _ r2:RowValue { return `${r1} ${op} ${r2}`; }
  / v:Value x:(_ op:BinOp _ e:Expression1 { return `${op} ${e}`; })?
  { if (x) return `${v} ${x}`; else return v; }
  ;

Value
  = CaseExpression
  / "(" _ e:Expression _ ")" { return `(${e})` }
  / &(("from" / "with" / "values") boundary) t:Table { return `(${t})` }
  / "not" __ "exists" boundary _ t:Table { return `not exists (${t})` }
  / "exists" boundary _ t:Table { return `exists (${t})` }
  / Variable
  / Literal
  / "cast" _ "(" _ e:Expression _ boundary "as" boundary _ t:TypeName _ ")" { return `cast(${e} as ${t})`; }
  / Pack
  / WindowFunctionCall
  / FilteredFunctionCall
  / RaiseFunctionCall
  / FunctionCall
  / n1:Name ns:(
    _ "." _ n2:Name n3:(
      _ "." _ n:Name { return n; }
    )? { return n3 != null ? `.${n2}.${n3}` : `.${n2}`; }
  )? ! (_ "." _ "*") { return ns != null ? `${n1}${ns}` : n1; }
  ;

Pack
  = "pack" _ b:PackBody {
    return b;
  }

PackBody
  = "{" _ ps:PackNameList _ "}" {
    return `json_object(${ps.map(([k, e]) => {
      return `${quote(k)}, ${e}`;
    }).join(", ")})`;
  }
  / "[" _ es:PackBody|.., _ "," _| _ "]" {
    return `json_array(${es.join(", ")})`;
  }
  / Expression

PackName
  = k:JSONObjectKey _ ":" _ e:PackBody { return [k, e]; }
  / n:Name &(_ ("," / "}")) { return [unquoteSQLName(n), n]; }
  / e:Expression { return [e, e]; }

PackNameList
  = l:PackName|.., _ "," _|

UnpackKeyValue
  = k:JSONObjectKey _ ":" _ l:UnpackBody { return l.map(([k1, n]) => [`.${JSON.stringify(k)}${k1}`, n]); }
  / k:JSONObjectKey { return [[`.${JSON.stringify(k)}`, k]]; }

UnpackObject
  = l:UnpackKeyValue|.., _ "," _| { return l.flat(); }

UnpackArray
  = l:UnpackBody|.., _ "," _| { return l.flat(); }

UnpackBody
  = "{" _ l:UnpackObject _ "}" { return l; }
  / "[" _ l:UnpackArray _ "]" { return l.map(([k, n], i) => {
    return [`[${i}]${k}`, n];
  }); }
  / n:Name { return [["", unquoteSQLName(n)]]; }

Unpack
  = "unpack" boundary _ e:(
    "(" _ e:Expression _ ")" { return `(${e})`; }
    / s:Name _ "." _ t:Name _ "." _ n:Name { return `${s}.${t}.${n}`; }
    / t:Name _ "." _ n:Name { return `${t}.${n}`; }
    / n:Name { return n; }
  ) _ ps:UnpackBody {
    return ps.map(([k, n]) => {
      return {
        name: quoteSQLName(n),
        expression: `${e}->>${quote(`$${k}`)}`,
        sort: null
      };
    });
  }

FilterClause
  = "filter" _ "(" _ "where" boundary _ e:Expression _ ")" { return e; }
  / "[" _ e:Expression _ "]" { return e; }
  ;

OverClause
  = "over" _ w:WindowDefn { return `over ${w}`; }
  / "over" _ n:Name { return `over ${n}`; }
  ;

WindowDefn
  = "("
      n:(_ !(("partition"/"order"/"range"/"rows"/"groups") boundary) n:Name { return n; })?
      ps:(_ boundary "partition" __ "by" boundary _ e1:Expression es:(_ "," _ e:Expression { return e; })* { return [e1, ...es]; })?
      os:(_ boundary "order" __ "by" boundary _ e1:OrderingTerm es:(_ "," _ e:OrderingTerm { return e; })* { return [e1, ...es]; })?
      f:(_ f:FrameSpec { return f; })?
      _ ")"
    {
      const a = [];
      if (n != null) a.push(n);
      if (ps != null) a.push(`partition by ${ps.join(", ")}`)
      if (os != null) a.push(`order by ${os.join(", ")}`)
      if (f != null) a.push(f);
      return "(" + a.join(" ") + ")";
    }
  ;

OrderingTerm
  = e:Expression
    c:(_ boundary "collate" n:Name { return n; })?
    a:(_ boundary a:("asc"/"desc") { return a; })?
    n:(_ boundary n:("nulls" __ "first" { return "nulls first"; } / "nulls" __ "last" { return "nulls last"; }) { return n; })?
    {
      let x = e;
      if (c != null) x += ` collate ${c}`;
      if (a != null) x += ` ${a}`;
      if (n != null) x += ` ${n}`;
      return x;
    }
  ;

FrameSpec
  = t:("range"/"rows"/"groups") boundary _
    r:(
      "between" boundary _ b1:(
        "unbounded" __ "preceding" { return `unbounded preceding`; }
        / "current" __ "row" { return `current row`; }
        / e:Expression _ boundary pf:("preceding"/"following") { return `${e} ${pf}`; }
      ) _ boundary "and" boundary _ b2:(
        "unbounded" __ "following" { return `unbounded following`; }
        / "current" __ "row" { return `current row`; }
        / e:Expression _ boundary pf:("preceding"/"following") { return `${e} ${pf}`; }
      )
      { return `between ${b1} and ${b2}`; }
      / "unbounded" __ "preceding" { return `unbounded preceding`; }
      / e:Expression _ boundary "preceding" { return `${e} preceding`; }
      / "current" __ "row" { return `current row`; }
    )
    x:(_ boundary "exclude" __ x:(
      "no" __ "others" { return `exclude no others`; }
      / "current" __ "row" { return `exclude current row`; }
      / "group" { return `exclude group`; }
      / "ties" { return `exclude ties`; }
    ) { return x; })?
    {
      const a = [t, r];
      if (x != null) a.push(x);
      return a.join(" ");
    }
  ;

WindowFunctionCall
  = e:FilterClause _ o:OverClause _ f:FunctionCall { return `${f} filter (where ${e}) ${o}`; }
  / o:OverClause _ f:FunctionCall { return `${f} ${o}`; }

FilteredFunctionCall
  = e:FilterClause _ f:FunctionCall { return `${f} filter (where ${e})`; }

RaiseFunctionCall
  = "raise" _ "(" _ "ignore" _ ")" { return `raise(ignore)`; }
  / "raise" _ "(" _ t:("rollback" / "abort" / "fail") _ "," _ message:Expression _ ")" { return `raise(${t}, ${message})`; }

FunctionCall
  = n:Name _ "(" _ rs:(
    ")" { return `)`; }
    / "*" _ ")" { return `*)`; }
    / "distinct" boundary _ e:Expression _ ")" { return `distinct ${e})`; }
    / es:Expressions _ ")" { return `${es})`; }
  ) { return `${n}(${rs}`; }
  ;

NotTypeName
  = ("constraint"/"primary"/"not"/"unique"/"check"/"default"/"collate"/"references"/"generated"/"as") boundary

TypeName
  = !NotTypeName x:(
    n1:Name ns:(_ !NotTypeName n:Name { return n; })* "(" _ s1:SignedNumber _ "," _ s2:SignedNumber _ ")"
    { return [n1, ...ns].join(" ") + `(${s1}, ${s2})` }
    / n1:Name ns:(_ !NotTypeName n:Name { return n; })* "(" _ s1:SignedNumber _ ")"
    { return [n1, ...ns].join(" ") + `(${s1})` }
    / n1:Name ns:(_ !NotTypeName n:Name { return n; })*
    { return [n1, ...ns].join(" ") }
  )
  { return x; }

SignedNumber
  = s:[-+]? _ n:NumericLiteral {
    if (s != null) {
      return `${s}${n}`;
    } else {
      return n;
    }
  }

Name "name"
  = QuotedName
  / Identifier
  ;

QuotedName "quoted name"
  = $('`' ("``" / [^`\u0000])* '`')+

Identifier "identifier"
  = n:$(
    ![ \f\n\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]
    [_A-Za-z\u0100-\uffff]
    (
      ![ \f\n\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]
      [_A-Za-z0-9\u0100-\uffff])*) & {
    return reIdent.test(n);
  } {
    return intoSQLIdentifier(n);
  }
  ;

Literal "literal"
  = $("true" boundary)
  / $("false" boundary)
  / $("null" boundary)
  / StringLiteral
  / NumericLiteral
  ;

StringLiteral
  = SQLStringLiteral
  / &"E'" e:EscapedString { return e; }
  / s:JSONString { return quote(s); }

ParsedStringLiteral
  = l:SQLStringLiteral { return parseSQLStringLiteral(l); }
  / "E'" e:$EscapedStringBody "'" { return parseEscapedStringBody(e); }
  / s:JSONString { return s; }

SQLStringLiteral
  = $("'" ("''" / [^'\u0000])* "'")+

EscapedString
  = "E'" s:EscapedStringBody "'" {
    let fs = "";
    let args = "";
    for (const [f, ...a] of s) {
      fs += f;
      for (const x of a) {
        args += ", ";
        args += x;
      }
    }
    return `printf('${fs}'${args})`;
  }

EscapedStringBody
  = s:(
    "\\" c:(
      "'" { return ["''"]; }
      / '"' { return ['"']; }
      / "\\" { return ["\\"]; }
      / "/" { return ["/"]; }
      / "a" { return ["%s", "char(7)"]; }
      / "b" { return ["%s", "char(8)"]; }
      / "e" { return ["%s", "char(27)"]; }
      / "f" { return ["%s", "char(12)"]; }
      / "n" { return ["%s", "char(10)"]; }
      / "r" { return ["%s", "char(13)"];; }
      / "t" { return ["%s", "char(9)"]; }
      / "v" { return ["%s", "char(11)"]; }
      / "x" x:$([0-9A-Fa-f][0-9A-Fa-f]) { return ["%s", `char(0x${x})`]; }
      / "u{" x:$([0-9A-Fa-f]+) "}" { return ["%s", `char(0x${x})`]; }
      / "u" x:$([0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]) { return ["%s", `char(0x${x})`]; }
      / "u(" _ e:Expression _ ")" { return ["%s", `char(${e})`]; }
      / "(" _ e:Expression _ ")" { return ["%s", e]; }
      / "%" opt:$FormatOption "(" _ e:Expression _ ")" { return [`%${opt}`, e]; }
    ) { return c; }
    / "''" { return ["''"]; }
    / "%" { return ["%%"]; }
    / s:$([^%\\']+) { return [s] })*
  { return s; }

FormatOption
  = FormatFlags? FormatWidth? FormatPrecision? FormatType

FormatFlags = $([-+ 0#,!]+)
FormatWidth = $([1-9][0-9]*)
FormatPrecision = $("." [0-9]+)
FormatType = [diufeEgGxXoscqQw]

NumericLiteral
  = $("0x" [0-9A-Fa-f]+)
  / $([0-9]+ ("." [0-9]*)? ([eE] [0-9]+)?)
  / $("." [0-9]+ ([eE] [0-9]+)?)

RawBlock
  = p:$("`"+) tag:$([-_0-9A-Za-z]+)? "\r"? "\n"
  c:$((!(q:$("`"+) &{ return p === q; }) [^\r\n]* "\r"? "\n")*)
  $("`"+)
  { return { rawblock: [tag, c] }; }

comment
  = "/*" ((!"*/") .)* "*/"
  / "--" ((!"\n") .)*

space "space"
  = [ \f\n\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]
  ;

_
  = (comment / space+)*
  ;

boundary "boundary" = & {
  const re = /\b/y;
  re.lastIndex = offset();
  return re.test(input);
}

__ = _ boundary

JSONValue
  = JSONObject
  / JSONArray
  / JSONString
  / JSONNumber
  / JSONBoolean
  / JSONNull

JSONBoolean
  = "true" { return true; }
  / "false" { return false; }

JSONNull
  = "null" { return null; }

JSONObject
  = "{" _ kvs:JSONObjectEntry|.., _ "," _| _ "}" {
    return Object.fromEntries(kvs);
  } 

JSONObjectKey
  = JSONString
  / k:Name { return unquoteSQLName(k); }

JSONObjectEntry
  = k:JSONObjectKey _ ":" _ v:JSONValue { return [k, v]; }

JSONArray
  = "[" _ vs:JSONValue|.., _ "," _| _ "]" { return vs; }

JSONString
  = s:$("\"" JSONStringBody* "\"") { return JSON.parse(s); }

JSONStringBody
  = "\\u" [0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]
  / "\\" ["\\/bfnrt]
  / [^\u0000-\u001f"\\]

JSONNumber
  = n:$("-"? [0-9]+ ("." [0-9]+)? ([eE] [+-]? [0-9]+)?) { return JSON.parse(n); }

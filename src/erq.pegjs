{{

function parseSQLStringLiteral(l) {
  return l.substring(1, l.length - 1).replace(/''/g, "'");
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
  #expression;
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
  constructor(name, expression) {
    this.#name = name;
    this.#expression = expression;
  }
  toSQL(allowOrdered = false) {
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
        if (s.name) {
          sql += " as ";
          sql += s.name;
        }
      }
    }
    if (this.#expression) {
      sql += " from ";
      sql += this.#expression;
      if (this.#name) {
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
      if (j.name) {
        sql += " as ";
        sql += j.name;
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
    return new TableBuilder(this.#name, `(${this.toSQL(true)})`);
  }
  as(name) {
    return new TableBuilder(name, `(${this.toSQL(true)})`);
  }
  where(e) {
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
    for (const r of rs) {
      this.#select.push(r);
    }
    return this;
  }
  groupSelect(grs, rs) {
    if (this.#isSelected()) {
      return this.#paren().groupSelect(grs, rs);
    }
    this.#aggregate = true;
    for (const r of grs) {
      this.#group.push(r);
    }
    for (const r of rs) {
      this.#select.push(r);
    }
    return this;
  }
  window(w) {
    if (this.#isSelected()) {
      return this.#paren().window(w);
    }
    this.#window.push(w);
    return this;
  }
  join(tr, on, d) {
    if (this.#isSelected()) {
      return this.#paren().join(tr, on, d);
    }
    const j = { name: tr.name, expression: tr.expression, direction: d };
    if (on) {
      j.on = on;
    }
    this.#join.push(j);
    return this;
  }
  distinct(distinct) {
    if (distinct) {
      if (this.#isLimited()) {
        return this.#paren().distinct(distinct);
      }
      this.#distinct = true;
    }
    return this;
  }
  orderBy(order) {
    if (this.#isLimited()) {
      return this.#paren().orderBy(order);
    }
    this.#order = [...order, ...this.#order];
    return this;
  }
  limitOffset(limit, offset) {
    if (this.#isLimited()) {
      return this.#paren().limitOffset(limit, offset);
    }
    this.#limit = limit;
    this.#offset = offset;
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
  / "explain" __ "query" __ "plan" boundary _ s:Statement1 { return { type: "select", query: `explain query plan ${s.query}` }; }
  / "explain" boundary _ s:Statement1 { return { type: "select", query: `explain ${s.query}` }; }
  / Statement1

MetaStatement
  = l:LoadRawBlock { return { type: "command", command: "meta-load", args: l }}
  / c:CreateFunction { return { type: "command", command: "meta-create-function", args:c } }

Statement1
  = s:Attach { return { type: "attach", query: s }; }
  / s:Detach { return { type: "detach", query: s }; }
  / c:Create { return { type: "create", query: c }; }
  / d:Drop { return { type: "drop", query: d }; }
  / i:Insert r:ReturningClause? {  return r != null ? { type: "insert", query: i + r, returning: true } : { type: "insert", query: i }; }
  / d:Delete r:ReturningClause? { return r != null ? { type: "delete", query: d + r, returning: true } : { type: "delete", query: d }; }
  / d:Truncate { return { type: "delete", query: d }; }
  / s:Vacuum { return { type: "vacuum", query: s }; }
  / s:Pragma { return { type: "pragma", query: s }; }
  / s:Begin { return { type: "begin", query: s }; }
  / s:Savepoint { return { type: "savepoint", query: s }; }
  / s:Release { return { type: "release", query: s }; }
  / s:Commit { return { type: "commit", query: s }; }
  / s:Rollback { return { type: "rollback", query: s }; }
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

LoadRawBlock
  = "load" __ "table" boundary _ table:TableName _ d:("(" _ td:TableDef _ ")" _ { return td; })?
    boundary "from" _ x:(RawBlock/ParsedStringLiteral) opt:(_ opt1:LoadOption opts:(_ "," _ o:LoadOption { return o; })* { return [opt1, ...opts]; })?
  {
    const def = d && d.def;
    const columns = d && d.columns.filter(c => !c.constraints.some(({ body }) => body.startsWith("as"))).map(c => c.name);
    const options = Object.fromEntries(opt ?? []);
    if (typeof x === "string") {
      const path = typeof x === "string" ? x : null;
      return {
        table,
        def,
        columns,
        path,
        options,
      };
    } else {
      const contentType = x.rawblock[0];
      const content = x.rawblock[1];
      return {
        table,
        def,
        columns,
        contentType,
        content,
        options,
      };
    }
  }

LoadOption
  = "null" boundary _ s:ParsedStringLiteral { return ["null", s]; }
  / "header" { return ["header", true]; }
  / "no" __ "header" { return ["header", false]; }
  / "delimiter" boundary _ s:ParsedStringLiteral { return ["delimiter", s]; }
  / "quote" boundary _ s:ParsedStringLiteral { return ["quote", s]; }
  / "no" __ "quote" { return ["quote", null]; }
  / "escape" boundary _ s:ParsedStringLiteral { return ["escape", s]; }
  / "comment" boundary _ s:ParsedStringLiteral { return ["comment", s]; }
  / "encoding" boundary _ s:ParsedStringLiteral { return ["encoding", s]; }
  / "relax" __ "column" __ "count" __ lm:("less"/"more") { return ["relax_column_count_" + lm, true]; }
  / "relax" __ "column" __ "count" { return ["relax_column_count", true]; }
  / ("format" __)? f:("csv"/"json"/"lines")  { return ["format", f]; }

CreateFunction
  = "create" __ "function" boundary _ n:Name _ ps:FunctionParams _ "as" _ x:RawBlock
  {
    return [n, ps, x];
  }

FunctionParams
  = "(" _ ")" { return []; }
  / "(" _ n1:Identifier ns:(_ "," _ n:Identifier { return n; }) _ ")" { return [n1, ...ns]; }

TableDef
  = c1:ColumnDef cs:(_ "," _ c:ColumnDef { return c; })*
  { return { def: text(), columns: [c1, ...cs] } }

ColumnDef
  = name:Name type:(_ t:TypeName { return t; })? constraints:(_ c:ColumnConstraint { return c; })*
  { return { name, type, constraints }; }

ColumnConstraint
  = name:("constraint" n:Name { return n; })? body:$ColumnConstraintBody
  { return { name, body }}

ColumnConstraintBody
  = "primary" __ "key" (__ ("asc"/"desc"))? boundary ConflictClause? (__ "autoincrement")?
  / "not" __ "null" ConflictClause?
  / "unique" ConflictClause?
  / "check" _ "(" _ Expression _ ")"
  / "default" _ ("(" _ Expression _ ")" / Literal / SignedNumber)
  / "collate" boundary _ Name
  / "as" _ "(" _ Expression _ ")" (__ ("stored" / "virtual"))?

ConflictClause
  = __ "on" __ "conflict" __ ("rollback"/"abort"/"fail"/"ignore"/"replace")

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
      if (s.name) {
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
  / "drop" __ tv:("table" / "view" / "index") ie:(__ "if" __ "exists")? boundary _ n:TableName
  {
    if (ie) {
      return `drop ${tv} if exists ${n}`;
    } else {
      return `drop ${tv} ${n}`;
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
  = s:Name _ "." _ n:Name { return [s, n]; }
  / n:Name { return [null, n]; }

Table
  = WithTable
  / ValuesList
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
  = "(" _ an1:Name ans:(_ "," _ an:Name { return an; })* _ ")" _ { return [an1, ...ans]; }

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
    return new TableBuilder(null, `(${vs})`);
  }
  / tr:TableReference {
    return new TableBuilder(tr.name, tr.expression);
  }
  ;

ValuesList
  = "values" _ a:ColumnNameList? r1:Record rs:(_ ";" _ r:Record { return r; })*
  {
    const values = "values " + [r1, ...rs].map(r => `(${r})`).join(", ");
    if (a != null) {
      return `with \`$$v\`(${a.join(", ")}) as (${values}) select * from \`$$v\``;
    }
    return values;
  }
  / "values" _ a:ColumnNameList? "[" _ vs:(
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
  ;

Record
  = "{" _ vs:Expressions _ "}"
  {
    return vs;
  }

TableReference
  = n:Name _ ":" _ e:TableExpression { return { name: n, expression: e }; }
  / e:TableExpression { return { name: null, expression: e }; }
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
  / dw:("left" / "right" / "full") __ "join" boundary _ tr:TableReference on:(_ boundary "on" boundary _ e:Expression { return e; })? {
    return (tb) => tb.join(tr, on, dw);
  }
  / "join" boundary _ tr:TableReference on:(_ boundary "on" boundary _ e:Expression { return e; })? {
    return (tb) => tb.join(tr, on);
  }
  / "natural" __ "join" boundary _ tr:TableReference _ {
    return (tb) => tb.join(tr, null, "natural");
  }
  / w:WindowClause {
    return (tb) => tb.window(w);
  }
  ;

ValueReferences
  = r1:ValueReference rs:(_ "," _ r:ValueReference { return r; })* {
    return [r1, ...rs];
  }
  ;

ValueWildCardReferences
  = r1:ValueWildCardReference rs:(_ "," _ r:ValueWildCardReference { return r; })* {
    return [r1, ...rs];
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

TableExpression
  = "{" _ rs:ValueReferences _ "}" {
    return `(${new TableBuilder(null, null).select(rs).toSQL(true)})`;
  }
  / "(" _ t:Table _ ")" { return `(${t})`; }
  / s:Name _ "." _ n:Name _ "(" _ ")" { return `${s}.${n}()`; }
  / s:Name _ "." _ n:Name _ "(" _ es:Expressions _ ")" { return `${s}.${n}(${es})`; }
  / s:Name _ "." _ t:Name { return `${s}.${t}`; }
  / n:Name _ "(" _ ")" { return `${n}()`; }
  / n:Name _ "(" _ es:Expressions _ ")" { return `${n}(${es})`; }
  / Name
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
  / Literal
  / "cast" _ "(" _ e:Expression _ boundary "as" boundary _ t:TypeName _ ")" { return `cast(${e} as ${t})`; }
  / WindowFunctionCall
  / FilteredFunctionCall
  / FunctionCall
  / n1:Name ns:(
    _ "." _ n2:Name n3:(
      _ "." _ n:Name { return n; }
    )? { return n3 != null ? `.${n2}.${n3}` : `.${n2}`; }
  )? ! (_ "." _ "*") { return ns != null ? `${n1}${ns}` : n1; }
  ;

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
      if (ps != null) a.push(ps.map(e => `partition by ${e}`).join(", "))
      if (os != null) a.push(os.map(e => `order by ${e}`).join(", "))
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

FunctionCall
  = n:Name _ "(" _ rs:(
    ")" { return `)`; }
    / "*" _ ")" { return `*)`; }
    / "distinct" boundary _ e:Expression _ ")" { return `distinct ${e})`; }
    / es:Expressions _ ")" { return `${es})`; }
  ) { return `${n}(${rs}`; }
  ;

TypeName
  = !(("constraint"/"primary"/"not"/"unique"/"check"/"default"/"collate"/"references"/"generated"/"as") boundary) x:(
    n1:Name ns:(_ n:Name { return n; })* "(" _ s1:SignedNumber _ "," _ s2:SignedNumber _ ")"
    { return [n1, ...ns].join(" ") + `(${s1}, ${s2})` }
    / n1:Name ns:(_ n:Name { return n; })* "(" _ s1:SignedNumber _ ")"
    { return [n1, ...ns].join(" ") + `(${s1})` }
    / n1:Name ns:(_ n:Name { return n; })*
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
  = $('`' ("``" / [^`])* '`')+

Identifier "identifier"
  = n:$(
    ![ \f\n\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]
    [_A-Za-z\u0100-\uffff]
    (
      ![ \f\n\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]
      [_A-Za-z0-9\u0100-\uffff])*) & {
    return reIdent.test(n);
  } {
    if (keywords.has(n.toUpperCase())) {
      return `\`${n}\``;
    }
    return n;
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

ParsedStringLiteral
  = l:SQLStringLiteral { return parseSQLStringLiteral(l); }
  / "E'" e:$EscapedStringBody "'" { return parseEscapedStringBody(e); }

SQLStringLiteral
  = $("'" ("''" / [^'])* "'")+

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
      / "b" { return ["%s", "char(8)"]; }
      / "f" { return ["%s", "char(12)"]; }
      / "n" { return ["%s", "char(10)"]; }
      / "r" { return ["%s", "char(13)"];; }
      / "t" { return ["%s", "char(9)"]; }
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

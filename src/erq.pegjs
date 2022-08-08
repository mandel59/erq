{{

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
      .map((r) => [`(${r.expression})`, r.sort])
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
  where(e) {
    if (this.#aggregate) {
      this.#having.push(e);
    } else {
      this.#where.push(e);
    }
    return this;
  }
  select(rs) {
    if (this.#group.length === 0 && this.#select.length === 0) {
      for (const r of rs) {
        this.#select.push(r);
      }
      return this;
    } else {
      return new TableBuilder(this.#name, `(${this.toSQL(true)})`).select(rs);
    }
  }
  groupSelect(grs, rs) {
    if (this.#group.length > 0 || this.#select.length > 0) {
      return new TableBuilder(this.#name, `(${this.toSQL(true)})`).groupSelect(grs, rs);
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
  join(tr, on, d) {
    if (this.#group.length === 0 && this.#select.length === 0) {
      const j = { name: tr.name, expression: tr.expression, direction: d };
      if (on) {
        j.on = on;
      }
      this.#join.push(j);
      return this;
    } else {
      return new TableBuilder(this.#name, `(${this.toSQL(true)})`).join(tr, on, d);
    }
  }
  distinct(distinct) {
    this.#distinct = Boolean(distinct);
    return this;
  }
  orderBy(order) {
    if (this.#limit != null) {
      return new TableBuilder(this.#name, `(${this.toSQL(true)})`).orderBy(order);
    }
    this.#order = [...order, ...this.#order];
    return this;
  }
  limitOffset(limit, offset) {
    if (this.#limit != null) {
      return new TableBuilder(this.#name, `(${this.toSQL(true)})`).limitOffset(limit, offset);
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
  = "explain" __ "query" __ "plan" boundary _ s:Statement1 { return { type: "select", query: `explain query plan ${s.query}` }; }
  / "explain" boundary _ s:Statement1 { return { type: "select", query: `explain ${s.query}` }; }
  / Statement1

Statement1
  = s:Attach { return { type: "attach", query: s }; }
  / s:Detach { return { type: "detach", query: s }; }
  / c:Create { return { type: "create", query: c }; }
  / d:Drop { return { type: "drop", query: d }; }
  / t:Table { return { type: "select", query: t }; }

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
  / tv:("table" / "view") boundary _ n:TableName _ "<-" _ t:Table
  {
    return `create ${tv} ${n} as ${t}`;
  }

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
  = s:Name _ "." _ n:Name { return `${s}.${n}`; }
  / Name

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
    a:( "(" _ an1:Name ans:(_ "," _ an:Name { return an; })* _ ")" _ { return [an1, ...ans]; } )?
    boundary "as" boundary _ "(" _ t:Table _ ")" _
  {
    if (a != null) {
      return `${n}(${a.join(", ")}) as (${t})`;
    }
    return `${n} as (${t})`;
  }

TableUnion
  = t1:Table1
    ts:(_ ";" _ t:Table1 { return t; })*
    distinct:(_ boundary "distinct" boundary { return true; })?
    order:OrderClause?
    limitOffset:LimitOffsetClause?
    cs:(
      o:OrderClause { return ["orderBy", o]; }
      / l:LimitOffsetClause { return ["limitOffset", l] }
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
      let tb = new TableBuilder(null, `(${sql})`);
      for (const [tag, v] of cs) {
        if (tag === "orderBy") {
          tb = tb.orderBy(v);
        } else if (tag === "limitOffset") {
          const [limit, offset] = v;
          tb = tb.limitOffset(limit, offset);
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
  = "select" boundary _ rs:ValueReferences {
    return new TableBuilder(null, null).select(rs);
  }
  / "{" _ rs:ValueReferences _ "}" {
    return new TableBuilder(null, null).select(rs);
  }
  / vs:ValuesList {
    return new TableBuilder(null, `(${vs})`);
  }
  / tr:TableReference _ fs:Filters {
    let tb = new TableBuilder(tr.name, tr.expression);
    for (const f of fs) {
      tb = f(tb);
    }
    return tb;
  }
  / tr:TableReference {
    return new TableBuilder(tr.name, tr.expression);
  }
  ;

ValuesList
  = "values" boundary _ r1:Record rs:(_ ";" _ r:Record { return r; })*
  {
    return "values " + [r1, ...rs].map(r => `(${r})`).join(", ");
  }

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

UnOp
  = "~"
  / "+"
  / "-"
  / "not" boundary { return "not"; }
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
  / "<"
  / ">"
  / "<>"
  / "!="
  / "is" __ "not" boundary { return "is not"; }
  / "is" boundary { return "is"; }

Expression
  = e:Expression1OrRowValue _ boundary rest:(
    "not" __ "in" boundary _ t:Table _ op:BinOp _ e2:Expression { return `not in (${t}) ${op} ${e2}` }
    / "not" __ "in" boundary _ t:Table { return `not in (${t})`; }
    / "not" __ "in" _ "[" _ es:Expressions _ "]" _ op:BinOp _ e2:Expression { return `not in (${es}) ${op} ${e2}` }
    / "not" __ "in" _ "[" _ es:Expressions _ "]" { return `not in (${es})`; }
    / "in" boundary _ t:Table _ op:BinOp _ e2:Expression { return `in (${t}) ${op} ${e2}` }
    / "in" boundary _ t:Table { return `in (${t})`; }
    / "in" _ "[" _ es:Expressions _ "]" _ op:BinOp _ e2:Expression { return `in (${es}) ${op} ${e2}` }
    / "in" _ "[" _ es:Expressions _ "]" { return `in (${es})`; }
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

RowValue
  = "{" _ es:Expressions _ "}" { return `(${es})`; }
  / "from" boundary _ t:Table { return `(${t})`; }
  / v:ValuesList { return `(${v})`; }

Expression1
  = op:UnOp _ e:Expression1 { return `${op} ${e}` }
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
  / FilteredFunctionCall
  / FunctionCall
  / n1:Name ns:(
    _ "." _ n2:Name n3:(
      _ "." _ n:Name { return n; }
    )? { return n3 != null ? `.${n2}.${n3}` : `.${n2}`; }
  )? ! (_ "." _ "*") { return ns != null ? `${n1}${ns}` : n1; }
  ;

FilteredFunctionCall
  = "filter" _ "(" _ "where" boundary _ e:Expression _ ")" _ f:FunctionCall { return `${f} filter (where ${e})`; }
  / "[" _ e:Expression _ "]" _ f:FunctionCall { return `${f} filter (where ${e})`; }

FunctionCall
  = n:Name _ "(" _ rs:(
    ")" { return `)`; }
    / "distinct" boundary _ e:Expression _ ")" { return `distinct ${e})`; }
    / es:Expressions _ ")" { return `${es})`; }
  ) { return `${n}(${rs}`; }

TypeName
  = n1:Name ns:(_ n:Name { return n; })* "(" _ s1:SignedNumber _ "," _ s2:SignedNumber _ ")"
  { return [n1, ...ns].join(" ") + `(${s1}, ${s2})` }
  / n1:Name ns:(_ n:Name { return n; })* "(" _ s1:SignedNumber _ ")"
  { return [n1, ...ns].join(" ") + `(${s1})` }
  / n1:Name ns:(_ n:Name { return n; })*
  { return [n1, ...ns].join(" ") }

SignedNumber
  = s:[-+]? n:NumericLiteral { return `${s ?? ""}${n}`; }

Name "name"
  = $('`' [^`]* '`')+
  / n:$(
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
  / $("'" [^']* "'")+
  / NumericLiteral
  ;

NumericLiteral
  = $("0x" [0-9]+)
  / $([0-9]+ ("." [0-9]*)?)
  / $("." [0-9]+)

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

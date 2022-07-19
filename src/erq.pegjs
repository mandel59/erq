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

const reIdent = /^[\p{Lu}\p{Ll}\p{Lt}\p{Lm}\p{Lo}\p{Nl}][\p{Lu}\p{Ll}\p{Lt}\p{Lm}\p{Lo}\p{Nl}\p{Mc}\p{Nd}\p{Pc}\p{Cf}]*$/u;

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
    if (this.#group.length > 0) {
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
    if (this.#group.length === 0 && this.#select.length === 0) {
      for (const r of grs) {
        this.#group.push(r);
      }
      for (const r of rs) {
        this.#select.push(r);
      }
    } else {
      return new TableBuilder(this.#name, `(${this.toSQL(true)})`).groupSelect(grs, rs);
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

cli_readline = _ ss:(s:Statement? _ ";;" _ { return s; })* { return ss.filter(s => s != null); };

Statement
  = "explain" _ "query" _ "plan" _ s:Statement { return `explain query plan ${s}`; }
  / "explain" _ s:Statement { return `explain ${s}`; }
  / Table

Table
  = WithTable / ValuesList / TableUnion

WithTable
  = ts:WithClause+
    t:Table {
    return `with ${ts.join(", ")} ${t}`;
  }

WithClause
  = "with" _ n:Name _
    a:( "(" _ an1:Name ans:(_ "," _ an:Name { return an; })* _ ")" _ { return [an1, ...ans]; } )?
    "as" _ "(" _ t:Table _ ")" _
  {
    if (a != null) {
      return `${n}(${a.join(", ")}) as (${t})`;
    }
    return `${n} as (${t})`;
  }

TableUnion
  = t1:Table1
    ts:(_ ";" _ t:Table1 { return t; })*
    distinct:(_ "distinct" { return true; })?
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
  = _ "order" _ "by"
    _ e1:Expression s1:(_ s:("asc" / "desc") { return s; })?
    r:(_ "," _ e:Expression s:(_ s:("asc" / "desc") { return s; })? { return [e, s ?? "asc"]; })*
  {
    return [[e1, s1 ?? "asc"], ...r];
  }

LimitOffsetClause
  = _ "limit" _ limit:Expression _ "offset" _ offset:Expression { return [limit, offset]; }
  / _ "limit" _ limit:Expression { return [limit, null]; }
  / _ "offset" _ offset:Expression _ "limit" _ limit:Expression { return [limit, offset]; }

Table1
  = "select" _ rs:ValueReferences {
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
  = "values" _ r1:Record rs:(_ ";" _ r:Record { return r; })*
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
  / "where" _ e:Expression {
    return (tb) => tb.where(e);
  }
  / "{" _ grs:ValueReferences _ "=>" _ rs:ValueWildCardReferences _ "}" {
    return (tb) => tb.groupSelect(grs, [...grs, ...rs]);
  }
  / "{" _ grs:ValueReferences _ "=>" _ "}" {
    return (tb) => tb.groupSelect(grs, grs);
  }
  / "{" _ rs:ValueWildCardReferences _ "}" {
    return (tb) => tb.select(rs);
  }
  / "group" _ "by" _ grs:ValueReferences _ "select" _ rs:ValueWildCardReferences {
    return (tb) => tb.groupSelect(grs, rs);
  }
  / "select" _ rs:ValueWildCardReferences {
    return (tb) => tb.select(rs);
  }
  / "," _ tr:TableReference {
    return (tb) => tb.join(tr, null);
  }
  / d:(dw:("left" / "right" / "full") _ { return dw; })? "join" _ tr:TableReference _ "on" _ e:Expression {
    return (tb) => tb.join(tr, e, d);
  }
  / "natural" _ "join" _ tr:TableReference _ {
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
  = n:Name _ ":" _ e:Expression _ sort:("asc" / "desc") {
    return { name: n, expression: e, sort: sort };
  }
  / n:Name _ ":" _ e:Expression {
    return { name: n, expression: e, sort: null };
  }
  / e:Expression _ sort:("asc" / "desc") {
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
  = "(" _ t:Table _ ")" { return `(${t})`; }
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
  / "not"
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
  / "-"
  / "*"
  / "/"
  / "%"
  / "->>"
  / "->"
  / "between"
  / "and"
  / "or"
  / "is" _ "not" { return "is not"; }
  / "is"
  / "not" _ "glob" { return "not glob"; }
  / "glob"
  / "not" _ "like" { return "not like"; }
  / "like"
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
  / "is" _ "not" { return "is not"; }
  / "is"

Expression
  = "(" _ e:Expression _ ")" { return `(${e})` }
  / "select" _ t:Table _ op:BinOp _ e2:Expression { return `(${t}) ${op} ${e2}` }
  / "select" _ t:Table { return `(${t})` }
  / "not" _ "exists" _ t:Table _ op:BinOp _ e2:Expression { return `not exists (${t}) ${op} ${e2}` }
  / "not" _ "exists" _ t:Table { return `not exists (${t})` }
  / "exists" _ t:Table _ op:BinOp _ e2:Expression { return `exists (${t}) ${op} ${e2}` }
  / "exists" _ t:Table { return `exists (${t})` }
  / CaseExpression
  / e:Expression1OrRowValue _ "in" _ t:Table _ op:BinOp _ e2:Expression { return `${e} in (${t}) ${op} ${e2}` }
  / e:Expression1OrRowValue _ "in" _ t:Table { return `${e} in (${t})`; }
  / Expression1

CaseExpression
  = "case" _ w:WhenClause+ el:ElseClause? "end"
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
  / "case" _ ex:ExpressionOrRowValue _ w:WhenClause+ el:ElseClause? "end"
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
  / "if" _ c:Expression _ "then" _ e:Expression _ el:ElseClause? "end"
  {
    return `case when ${c} then ${e} ${el ?? ""}end`;
  }

WhenClause
  = "when" _ c:ExpressionOrRowValue _ "then" _ e:Expression _ { return `when ${c} then ${e} `; }

ElseClause
  = "else" _ e:Expression _ { return `else ${e} `; }

ExpressionOrRowValue
  = Expression
  / RowValue

Expression1OrRowValue
  = Expression1
  / RowValue

RowValue
  = "{" _ es:Expressions _ "}" { return `(${es})`; }
  / "select" _ t:Table { return `(${t})` }

Expression1
  = op:UnOp _ e:Expression1 { return `${op} ${e}` }
  / v:Value _ op:BinOp _ e:Expression1 { return `${v} ${op} ${e}` }
  / RowValueComparison
  / Value
  ;

RowValueComparison
  = r1:RowValue _ op:BinCompOp _ r2:RowValue { return `${r1} ${op} ${r2}`; }

Value
  = Literal
  / "cast" _ "(" _ e:Expression _ "as" _ t:TypeName _ ")" { return `cast(${e} as ${t})`; }
  / s:Name _ "." _ t:Name _ "." _ n:Name { return `${s}.${t}.${n}`; }
  / t:Name _ "." _ n:Name ! (_ "." _ "*") { return `${t}.${n}`; }
  / n:Name _ "(" _ ")" { return `${n}()`; }
  / n:Name _ "(" _ "distinct" _ e:Expression _ ")" { return `${n}(distinct ${e})`; }
  / n:Name _ "(" _ es:Expressions _ ")" { return `${n}(${es})`; }
  / n:Name ! (_ "." _ "*") { return n; }
  ;

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
  / n:$([_A-Za-z\u0100-\uffff][_A-Za-z0-9\u0100-\uffff]*) & {
    return reIdent.test(n);
  } {
    if (keywords.has(n.toUpperCase())) {
      return `\`${n}\``;
    }
    return n;
  }
  ;

Literal "literal"
  = "true"
  / "false"
  / "null"
  / $("'" [^']* "'")+
  / NumericLiteral
  ;

NumericLiteral
  = $("0x" [0-9]+)
  / $([0-9]+ ("." [0-9]*)?)
  / $("." [0-9]+)

comments
  = "/*" ((!"*/") .)* "*/"
  / "--" ((!"\n") .)*

space "space"
  = [ \f\n\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]
  ;

_ "boundary"
  = (comments / space)*
  ;

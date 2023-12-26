{{

import {
  merge,
  quoteSQLName,
  unquoteSQLName,
  parseSQLStringLiteral,
  intoSQLIdentifier,
  parseEscapedStringBody,
  isIdentifier,
  quote,
  escapeVegaField,
  TableBuilder,
} from "../src/parser-utils.js";

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
  / "explain" __ "query" __ "plan" __ s:Statement1 { return { type: "select", format: "eqp", query: `explain query plan ${s.query}`, dest: s.dest }; }
  / "explain" __ s:Statement1 { return { type: "select", query: `explain ${s.query}`, dest: s.dest }; }
  / IfStatement
  / ForStatement
  / Statement1

MetaStatement
  = l:LoadRawBlock { return { type: "command", command: "meta-load", args: l }}
  / c:CreateFunction { return { type: "command", command: "meta-create-function", args:c } }
  / c:CreateTableFromJson { return { type: "command", command: "meta-create-table-from-json", args:c } }
  / f:SetOutputFormat { return { type: "command", command: "meta-set-output", args:[f] } }

IfStatement
  = "if" _ "(" _ e:Expression _ ")" _ t:BlockStatement _ "else" __ f:BlockStatement
    { return { type: "if", condition: e, thenStatements: t, elseStatements: f }; }
  / "if" _ "(" _ e:Expression _ ")" _ t:BlockStatement
    { return { type: "if", condition: e, thenStatements: t }; }

ForStatement
  = "for" __ a:ForVarAssignments _ "of" __ t:Table _ ("do" __)? body:BlockStatement
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
  / "(" _ ss:Statement|1.., _ ";;" _| _ ";;" _ ")" { return ss; }

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
  / t:TriggerStatement f:FormattingClause? { return { ...t, ...f }; }

SetOutputFormat
  = "set" __ "format" __ f:(
    "dense" boundary { return "dense"; }
    / "sparse" boundary { return "sparse"; }
    / "array" boundary { return "dense"; }
    / "object" boundary { return "sparse"; }
    / Vega
  ) { return f; }

FormattingClause
  = _ "output" d:DestinationClause f:FormatClause? { return { ...f, ...d }; }
  / _ "output" f:FormatClause d:DestinationClause? { return { ...f, ...d }; }

FormatClause
  = _ ("format" __)? f:(
    "dense" boundary { return { format: "dense" }; }
    / "sparse" boundary { return { format: "sparse" }; }
    / "array" boundary { return { format: "dense" }; }
    / "object" boundary { return { format: "sparse" }; }
    / "raw" boundary { return { format: "raw" }; }
    / "csv" opts:CsvOptions? { return { format: "csv", formatOptions: { ...opts } }; }
    / v:Vega { return { format: v }; }
  ) { return f; }

CsvOptions
  = __ ("with" __)? opts:(
    "header" boundary { return { header: true }; }
    / "no" __ "header" boundary { return { header: false }; }
    / "delimiter" __ s:ParsedStringLiteral { return { delimiter: s }; }
    / "quote" __ s:ParsedStringLiteral { return { quote: s }; }
    / "no" __ "quote" boundary { return { quote: '' }; }
    / "escape" __ s:ParsedStringLiteral { return { escape: s }; }
    / "encoding" __ s:ParsedStringLiteral { return { encoding: s }; }
  )|1..,_ "," _| { return Object.assign({}, ...opts); }

DestinationClause
  = _ "to" __ d:(
    "stdout" boundary { return { type: "stdout" }; }
    / "stderr" boundary { return { type: "stderr" }; }
    / ("file" boundary _)? f:ParsedStringLiteral { return { type: "file", file: f }; }
  ) { return { dest: d } ; }

Vega
  = "vega" __ ("lite" __)? s:(s:("spec" / "svg" / "png" / "inline" (__ "image")? { return "inline"; }) __ { return s; })? ("with" __)? v:VegaView {
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
  = "repeat" __ d:VegaRepeatDefVars _ "(" _ v:VegaView _ ")"
    { return { repeat: d, spec: v }; }
  / "repeat" __ d:VegaRepeatDef _ n:VegaRepeatColumns? "(" _ v:VegaView _ ")"
    { return { repeat: d, spec: v, columns: n }; }

VegaRepeatColumns
  = "columns" __ n:JSONNumber _ { return n; }

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
  = ds:VegaRepeatDefVar|1.., _ "repeat" __| { return merge(...ds); }

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
  = "options" __ obj:JSONObject {
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
      "asc" boundary { return "ascending"; }
      / "desc" boundary { return "descending"; }
    ) _ ")" { return ["sort", { encoding: c, order: o }] }
  / "sort" _ "(" _ f:(VegaRepeatField / VegaAggregatedField / VegaField) _ o:(
      "asc" boundary { return "ascending"; }
      / "desc" boundary { return "descending"; }
    ) _ ")" { return ["sort", { ...f, order: o }] }
  / "sort" _ "[" _ vs:(ParsedStringLiteral / JSONValue)|.., _ "," _| "]" { return ["sort", vs]; }
  / "asc" boundary { return ["sort", "ascending"]; }
  / "desc" boundary { return ["sort", "descending"]; }
  / "nosort" boundary { return ["sort", null]; }

VegaBinning
  = "binned" boundary { return ["bin", "binned"]; }
  / "bin" boundary { return ["bin", true]; }

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
  = "transform" __ ms:VegaTransformMethod|1.., _|
    { return { transform: [].concat(...ms) }; }

VegaTransformMethod
  = "[" _ filter:VegaPredicate _ "]" { return [{ filter }]; }
  / "[" _ e:VegaExpression _ "]" { return [{ filter: e }]; }
  / "{" _ cs:VegaCalculateField|1.., _ "," _| _ "}" { return cs; }
  / "apply" __ obj:JSONObject { return [obj]; }

VegaPredicate
  = ps:VegaPredicate1|2.., _ "or" _|
    { return {"or": ps}; }
  / VegaPredicate1

VegaPredicate1
  = ps:VegaPredicate2|2.., _ "and" _|
    { return {"and": ps}; }
  / VegaPredicate2

VegaPredicate2
  = "not" __ p:VegaPredicate2 { return {"not": p}; }
  / VegaPredicate3

VegaPredicate3
  = "(" _ p:VegaPredicate _ ")" { return p; }
  / "valid" _ "(" _ f:Name _ ")"
    { return { field: escapeVegaField(unquoteSQLName(f)), valid: true }; }
  / f:Name _ "in" _ "[" _ vs:(EscapedString / JSONValue)|.., _ "," _| _ "]"
    { return { field: escapeVegaField(unquoteSQLName(f)), oneOf: vs }; }
  / f:Name _ t:VegaTimeUnit _ "in" _ "[" _ vs:(EscapedString / JSONValue)|.., _ "," _| _ "]"
    { return { field: escapeVegaField(unquoteSQLName(f)), timeUnit: t, oneOf: vs }; }
  / f:Name _ "between" __ a:VegaValue _ "and" __ b:VegaValue
    { return { field: escapeVegaField(unquoteSQLName(f)), range: [a, b] }; }
  / f:Name _ t:VegaTimeUnit _ "between" __ a:VegaValue _ "and" __ b:VegaValue
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
  = "not" __ e:VegaExpression2
    { return `!(${e})`; }
  / VegaExpression2

VegaExpression2
  = e:VegaExpression3 _ "between" __ e1:VegaExpression3 _ "and" __ e2:VegaExpression3
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
  = "savepoint" __ n:Name
  { return `savepoint ${n}`; }

Release
  = "release" __ n:Name
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
  = "analyze" __ s:Name _ "." _ n:Name { return `analyze ${s}.${n}`; }
  / "analyze" __ n:Name { return `analyze ${n}`; }
  / "analyze" boundary { return "analyze"; }

LoadRawBlock
  = "load" __ "table" boundary
    ifNotExists:(_ "if" __ "not" __ "exists" boundary { return true; })?
    _ table:TableNameWithVariable _ d:("(" _ td:TableDef _ ")" _ { return td; })?
    "from" __ x:(
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
  = "null" __ s:ParsedStringLiteral { return ["null", s]; }
  / "header" boundary { return ["header", true]; }
  / "no" __ "header" boundary { return ["header", false]; }
  / "delimiter" __ s:ParsedStringLiteral { return ["delimiter", s]; }
  / "quote" __ s:ParsedStringLiteral { return ["quote", s]; }
  / "no" __ "quote" boundary { return ["quote", false]; }
  / "escape" __ s:ParsedStringLiteral { return ["escape", s]; }
  / "comment" __ s:ParsedStringLiteral { return ["comment", s]; }
  / "encoding" __ s:ParsedStringLiteral { return ["encoding", s]; }
  / "relax" __ "column" __ "count" __ lm:("less"/"more") boundary { return ["relax_column_count_" + lm, true]; }
  / "relax" __ "column" __ "count" boundary { return ["relax_column_count", true]; }
  / "sniff" __ "size" __ n:JSONNumber { return ["sniff_size", n]; }
  / ("format" __)? f:("csv"/"ndjson") { return ["format", f]; }

CreateFunction
  = "create" __ "function" __ n:Name _ ps:FunctionParams _ "as" __ x:RawBlock
  {
    return [n, ps, x];
  }

CreateTableFromJson
  = "create" __ "table"
    ine:(__ "if" __ "not" __ "exists")? __
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
  = name:("constraint" __ n:Name { return n; })? body:ColumnConstraintBody
  {
    const def = name ? `constraint ${name} ${body}` : body;
    return { def, name, body }
  }

ColumnConstraintBody
  = "primary" __ "key" d:(__ d:("asc"/"desc") { return ` ${d}`; })? boundary cc:ConflictClause? a:(_ "autoincrement" boundary {return " autoincrement"; })? { return `primary key${d ?? ""}${cc ?? ""}${a ?? ""}`; }
  / "not" __ "null" boundary cc:ConflictClause? { return `not null${cc ?? ""}`; }
  / "unique" boundary cc:ConflictClause? { return `unique${cc ?? ""}`; }
  / "check" _ "(" _ e:Expression _ ")" { return `check (${e})`; }
  / "default" __ x:("(" _ e:Expression _ ")" { return `(${e})`; } / Literal / Current / SignedNumber) { return `default ${x}`; }
  / "collate" __ n:Name { return `collate ${n}`; }
  / "as" _ "(" _ e:Expression _ ")" x:(__ x:("stored" / "virtual") { return ` ${x}`; })? { return `as (${e})${x ?? ""}`; }

Current
  = "current_timestamp" boundary { return "current_timestamp"; }
  / "current_time" boundary { return "current_time"; }
  / "current_date" boundary { return "current_date"; }

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
  = _ "on" __ "conflict" __ k:("rollback"/"abort"/"fail"/"ignore"/"replace") { return ` on conflict ${k}`; }

Attach
  = "attach" __ e:Expression _ "as" __ n:Name {
    return `attach ${e} as ${n}`;
  }

Detach
  = "detach" __ n:Name {
    return `detach ${n}`;
  }

Create
  = "create" __ "temporary" __ tv:("table" / "view") boundary ine:(_ "if" __ "not" __ "exists" boundary)? _ n:Name _ boundary "as" __ t:Table
  {
    if (ine) {
      return `create temporary ${tv} if not exists ${n} as ${t}`;
    } else {
      return `create temporary ${tv} ${n} as ${t}`;
    }
  }
  / "create" __ tv:("table" / "view") boundary ine:(_ "if" __ "not" __ "exists" boundary)? _ n:TableName _ "as" __ t:Table
  {
    if (ine) {
      return `create ${tv} if not exists ${n} as ${t}`;
    } else {
      return `create ${tv} ${n} as ${t}`;
    }
  }
  / "create" boundary uniq:(_ "unique" boundary { return " unique"; })? _ "index" boundary
    ine:(_ "if" __ "not" __ "exists" boundary { return " if not exists"; })? _ n:TableName _
      "on" __ tn:Name cond:(_ "[" _ cond:Expression _ "]" { return ` where ${cond}`; })? _ "(" _ ic:IndexedColumns ")"
  {
    return `create${uniq ?? ""} index${ine ?? ""} ${n} on ${tn} (${ic})${cond ?? ""}`;
  }
  / "create" __ "virtual" __ "table" __ n:TableName _ boundary "using" __ tn:Name _ "(" a:$ModuleArguments ")"
  {
    return `create virtual table ${n} using ${tn}(${a})`;
  }
  / "create" __ "table" boundary ine:(_ "if" __ "not" __ "exists" boundary)? _ n:TableName _ "(" _ td:TableDef _ ")"
  {
    if (ine != null) {
      return `create table if not exists ${n} (${td.def})`;
    } else {
      return `create table ${n} (${td.def})`;
    }
  }
  / "create" temp:(__ "temporary" { return " temporary"; })? __ "trigger" boundary
    ine:(_ "if" __ "not" __ "exists" boundary { return " if not exists"; })?
    _ trig:TableName
    _ triggerPhase:("before"/"after"/"instead" __ "of" boundary { return "instead of"; })
    _ triggerMethod:("delete"/"insert"/"update" __ "of" __ cns:NameList { return `update of ${cns.join(", ")}`; })
    _ "on" __ tn:TableName when:(_ "when" __ when:Expression { return ` when ${when}`; })?
    _ ss:BlockTriggerStatement
  {
    return `create${temp ?? ""} trigger${ine ?? ""} ${trig} ${triggerPhase} ${triggerMethod} on ${tn}${when ?? ""} begin ${ss.map(s => `${s.query};`).join("")} end`;
  }
  / tv:("table" / "view") __ x:TableName1 _ a:ColumnNameList? "=" _ t:Table
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
  = "alter" __ "table" __ n:TableName _ "rename" __ "to" __ d:Name { return `alter table ${n} rename to ${d}`; }
  / "alter" __ "table" __ n:TableName _ "rename" __ c:Name _ boundary "to" __ d:Name { return `alter table ${n} rename ${c} to ${d}`; }
  / "alter" __ "table" __ n:TableName _ "add" __ d:ColumnDef { return `alter table ${n} add ${d.def}`; }
  / "alter" __ "table" __ n:TableName _ "drop" __ c:Name { return `alter table ${n} drop ${c}`; }

Insert
  = ts:WithClause*
    "insert" __ "into" __ n:TableName
    a:(_ nl:ColumnNameList { return ` (${nl.join(", ")})` })?
    _ t:Table up:UpsertClause*
  {
    const withclause = ts.length > 0 ? "with " + ts.join(", ") + " " : "";
    if (up.length > 0) {
      // workaround for syntax ambiguity
      t = `select * from (${t}) where 1`;
    }
    return `${withclause}insert into ${n}${a ?? ""} ${t}${up.join("")}`;
  }
  / ts:WithClause* n:TableName
    a:(_ nl:ColumnNameList { return ` (${nl.join(", ")})` })?
    _ "<-" _ t:Table up:UpsertClause*
  {
    const withclause = ts.length > 0 ? "with " + ts.join(", ") + " " : "";
    if (up.length > 0) {
      // workaround for syntax ambiguity
      t = `select * from (${t}) where 1`;
    }
    return `${withclause}insert into ${n}${a ?? ""} ${t}${up.join("")}`;
  }
  ;

UpsertClause
  = _ "on" __ "conflict" ct:ConflictTarget? _ "do" __ ua:UpsertAction {
    return ` on conflict${ct ?? ""} do ${ua}`;
  }

ConflictTarget
  = _ "(" _ cs:IndexedColumns _ ")" _ "where" __ cond:Expression
    { return ` (${cs}) where ${cond}`; }
  / _ "(" _ cs:IndexedColumns _ ")"
    { return ` (${cs})`; }
  / _ cond:BracketCondExpressionSeries _ "(" cs:IndexedColumns ")"
    { return ` (${cs}) where ${cond}`; }

UpsertAction
  = "nothing" { return "nothing"; }
  / "update" __ ss:SetClause|.., _|
    where:(_ "where" __ e:Expression { return ` where ${e}`; })?
    { return `update set ${ss.join(", ")}${where ?? ""}`; }
  / "update" __ cond:BracketCondExpressionSeries _ ss:SetClause|.., _|
    { return `update set ${ss.join(", ")} where ${cond}`; }

Delete
  = ts:WithClause*
    "delete" __ "from" __ n:TableName _
    "where" __ e:Expression
  {
    const withclause = ts.length > 0 ? "with " + ts.join(", ") + " " : "";
    return `${withclause}delete from ${n} where ${e}`;
  }
  / ts:WithClause*
    "delete" __ n:TableName _ e:BracketCondExpressionSeries
  {
    const withclause = ts.length > 0 ? "with " + ts.join(", ") + " " : "";
    return `${withclause}delete from ${n} where ${e}`;
  }

Update
  = ts:WithClause*
    "update" __ n:TableName cond:(_ e:BracketCondExpressionSeries { return e; })?
    ss:(_ s:SetClause { return s; })*
  {
    const withclause = ts.length > 0 ? "with " + ts.join(", ") + " " : "";
    return `${withclause}update ${n} set ${ss.join(", ")}${cond ? ` where ${cond}` : ""}`
  }

BracketCondExpression
  = "[" _ e:Expression _ "]" { return e; }

BracketCondExpressionSeries
  = es:BracketCondExpression|1..| {
    if (es.length == 1) {
      return es[0];
    } else {
      return `(${es.join(") and (")})`;
    }
  }

SetClause
  = "set" __ l:UpdateLHS _ "=" _ e:Expression { return `${l} = ${e}`; }

UpdateLHS
  = "{" _ an1:Name ans:(_ "," _ an:Name { return an; })* _ "}" _ { return `(${[an1, ...ans].join(", ")})`; }
  / t:Name

Truncate
  = "truncate" __ "table" __ n:TableName
  { return `delete from ${n}`; }

Vacuum
  = "vacuum" __ n:Name _ boundary "into" boundary s:SQLStringLiteral
  { return `vacuum ${n} into ${s}`; }
  / "vacuum" __ "into" boundary s:SQLStringLiteral
  { return `vacuum into ${s}`; }
  / "vacuum" __ n:Name
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
  = rs:(_ boundary "returning" __ rs:ValueWildCardReferences { return rs; })
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
  = "drop" __ "temporary" __ tv:("table" / "view" / "trigger") __ n:TableName
  {
    return `drop temporary ${tv} ${n}`;
  }
  / "drop" __ tv:("table" / "view" / "index" / "trigger") ie:(__ "if" __ "exists")? __ n:TableName
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
  / ("from" __)? t:TableUnion { return t; }

WithTable
  = ts:WithClause+
    t:Table {
    return `with ${ts.join(", ")} ${t}`;
  }

WithClause
  = "with" __ n:Name _
    a:ColumnNameList?
    "as" __ "(" _ t:Table _ ")" _
  {
    if (a != null) {
      return `${n}(${a.join(", ")}) as (${t})`;
    }
    return `${n} as (${t})`;
  }

WindowClause
  = "window" __ n:Name _ boundary "as" __ w:WindowDefn
  { return { name: n, window: w }; }

ColumnNameList
  = "(" _ ns:NameList _ ")" _ { return ns; }

NameList
  = an1:Name ans:(_ "," _ an:Name { return an; })* { return [an1, ...ans]; }

ConcatenatedTables
  = Table1|1.., _ ";" _|

ExceptTable
  = _ "except" __ t:Table1 { return t; }

IntersectTable
  = _ "intersect" __ t:Table1 { return t; }

ExceptIntersectTable
  = t:ExceptTable { return ["except", t]; }
  / t:IntersectTable { return ["intersect", t]; }

TableUnion
  = tss:ConcatenatedTables
    tex:ExceptIntersectTable*
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
    let [t1, ...ts] = tss;
    const union = distinct ? " union " : " union all "
    let sql;
    t1.distinct(distinct);
    if (ts.length === 0) {
      if (order != null) {
        t1 = t1.orderBy(order);
      }
      if (tex.length === 0) {
        sql = t1.toSQL(true);
      } else {
        sql = t1.toSQL(false);
        for (const [k, t] of tex) {
          sql = `${sql} ${k} ${t.toSQL(false)}`;
        }
      }
    } else {
      sql = `${t1.toSQL(false)}${union}${ts.map(tb => tb.distinct(distinct).toSQL(false)).join(union)}`;
      for (const [k, t] of tex) {
        sql = `${sql} ${k} ${t.toSQL(false)}`;
      }
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
  = _ "as" __ n:Name { return n; }
  ;

OrderClause
  = _ boundary "order" __ "by" boundary
    _ e1:Expression s1:(_ s:("asc" / "desc") { return s; })?
    r:(_ "," _ e:Expression s:(_ s:("asc" / "desc") { return s; })? { return [e, s ?? "asc"]; })*
  {
    return [[e1, s1 ?? "asc"], ...r];
  }

LimitOffsetClause
  = _ boundary "limit" __ limit:Expression _ boundary "offset" __ offset:Expression { return [limit, offset]; }
  / _ boundary "limit" __ limit:Expression { return [limit, null]; }
  / _ boundary "offset" __ offset:Expression _ boundary "limit" __ limit:Expression { return [limit, offset]; }

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
  = "select" __ rs:ValueReferences {
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
  = "values" __ a:ColumnNameList? "[" _ vs:(
      e1:(Record/Expression) es:(_ "," _ e:(Record/Expression) { return e; })* { return [e1, ...es].map(e => `(${e})`).join(", "); }
    ) _ "]"
  {
    const values = "values " + vs;
    if (a != null) {
      return `select ${a.map(c => `null as ${c}`).join(", ")} where 0 union all ${values}`;
    }
    return values;
  }
  / "values" __ a:ColumnNameList "[" _ "]"
  {
    return `select ${a.map(c => `null as ${c}`).join(", ")} where 0`;
  }
  / "values" __ "[" _ jsonarray:JSONObject|.., _ "," _| _ "]"
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
  / "where" __ e:Expression {
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
  / "group" __ "by" __ grs:ValueReferences _ boundary "select" __ rs:ValueWildCardReferences {
    return (tb) => tb.groupSelect(grs, rs);
  }
  / "select" __ rs:ValueWildCardReferences {
    return (tb) => tb.select(rs);
  }
  / dw:("left" / "right" / "full" / "inner" / "cross") __ "join" __ tr:TableReference _ boundary "using" __ "(" _ u:NameList _ ")" {
    return (tb) => tb.joinUsing(tr, u, dw);
  }
  / dw:("left" / "right" / "full" / "inner" / "cross") __ "join" __ tr:TableReference on:(_ boundary "on" __ e:Expression { return e; })? {
    return (tb) => tb.join(tr, on, dw);
  }
  / "join" __ tr:TableReference _ boundary "using" __ "(" _ u:NameList _ ")" {
    return (tb) => tb.joinUsing(tr, u);
  }
  / "join" __ tr:TableReference on:(_ boundary "on" __ e:Expression { return e; })? {
    return (tb) => tb.join(tr, on);
  }
  / "natural" __ "join" __ tr:TableReference {
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
  = e:Expression1 _ boundary rest:(
    "not" __ "in" __ t:Table _ op:BinOp _ e2:Expression { return `not in (${t}) ${op} ${e2}` }
    / "not" __ "in" __ t:Table { return `not in (${t})`; }
    / "not" __ "in" _ "[" _ es:RecordOrExpressionList _ "]" _ op:BinOp _ e2:Expression { return `not in (${es}) ${op} ${e2}` }
    / "not" __ "in" _ "[" _ es:RecordOrExpressionList _ "]" { return `not in (${es})`; }
    / "in" __ t:Table _ op:BinOp _ e2:Expression { return `in (${t}) ${op} ${e2}` }
    / "in" __ t:Table { return `in (${t})`; }
    / "in" _ "[" _ es:RecordOrExpressionList _ "]" _ op:BinOp _ e2:Expression { return `in (${es}) ${op} ${e2}` }
    / "in" _ "[" _ es:RecordOrExpressionList _ "]" { return `in (${es})`; }
  ) { return `${e} ${rest}`; }
  / Expression1

CaseExpression
  = "case" __ w:WhenClause+ el:ElseClause? boundary "end" boundary
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
  / "case" __ ex:ExpressionOrRowValue _ w:WhenClause+ el:ElseClause? boundary "end" boundary
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
  / "if" __ c:Expression _ boundary "then" __ e:Expression _ el:ElseClause? boundary "end" boundary
  {
    return `case when ${c} then ${e} ${el ?? ""}end`;
  }

WhenClause
  = "when" __ c:ExpressionOrRowValue _ boundary "then" __ e:Expression _ { return `when ${c} then ${e} `; }

ElseClause
  = "else" __ e:Expression _ { return `else ${e} `; }

ExpressionOrRowValue
  = Expression
  / RowValue

RecordOrExpressionList
  = e1:RecordOrExpression es:(_ "," _ e:RecordOrExpression { return e; })*
  { return [e1, ...es].join(", "); }

RecordOrExpression
  = r:Record {return `(${r})`}
  / Expression

RowValue
  = "{" _ es:Expressions _ "}" { return `(${es})`; }
  / "from" __ t:Table { return `(${t})`; }
  / v:ValuesList { return `(${v})`; }

Expression1
  = op:UnOp _ e:Expression1 { return `${op}${e}` }
  / r1:RowValue _ op:BinCompOp _ r2:RowValue { return `${r1} ${op} ${r2}`; }
  / v:Value x:(_ op:BinOp _ e:Expression1 { return `${op} ${e}`; })?
    { if (x) return `${v} ${x}`; else return v; }
  / RowValue
  ;

Value
  = CaseExpression
  / "(" _ e:Expression _ ")" { return `(${e})` }
  / &(("from" / "with" / "values") boundary) t:Table { return `(${t})` }
  / "not" __ "exists" __ t:Table { return `not exists (${t})` }
  / "exists" __ t:Table { return `exists (${t})` }
  / Variable
  / Literal
  / "cast" _ "(" _ e:Expression _ boundary "as" __ t:TypeName _ ")" { return `cast(${e} as ${t})`; }
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
  = "pack" __ b:PackBody {
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
  = "unpack" __ e:(
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
  = "filter" _ "(" _ "where" __ e:Expression _ ")" { return e; }
  / "[" _ e:Expression _ "]" { return e; }
  ;

OverClause
  = "over" __ w:WindowDefn { return `over ${w}`; }
  / "over" __ n:Name { return `over ${n}`; }
  ;

WindowDefn
  = "("
      n:(_ !(("partition"/"order"/"range"/"rows"/"groups") boundary) n:Name { return n; })?
      ps:(_ boundary "partition" __ "by" __ e1:Expression es:(_ "," _ e:Expression { return e; })* { return [e1, ...es]; })?
      os:(_ boundary "order" __ "by" __ e1:OrderingTerm es:(_ "," _ e:OrderingTerm { return e; })* { return [e1, ...es]; })?
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
  = t:("range"/"rows"/"groups") __
    r:(
      "between" __ b1:(
        "unbounded" __ "preceding" { return `unbounded preceding`; }
        / "current" __ "row" { return `current row`; }
        / e:Expression _ boundary pf:("preceding"/"following") { return `${e} ${pf}`; }
      ) _ boundary "and" __ b2:(
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
  / o:OverClause _ f:FilteredFunctionCall { return `${f} ${o}`; }
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
    / "distinct" __ es:Expressions oc:OrderClause? _ ")" {
      if (oc == null) return `distinct ${es})`;
      return `distinct ${es} order by ${oc.map(([v, dir]) => `${v} ${dir}`).join(", ")})`;
    }
    / es:Expressions oc:OrderClause? _ ")" {
      if (oc == null) return `${es})`;
      return `${es} order by ${oc.map(([v, dir]) => `${v} ${dir}`).join(", ")})`;
    }
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
    return isIdentifier(n);
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
  = "E''" { return "''"; } // printf('') returns null. this is a workaround.
  / "E'" s:EscapedStringBody "'" {
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
      / "a" { return ["%c", "char(7)"]; }
      / "b" { return ["%c", "char(8)"]; }
      / "e" { return ["%c", "char(27)"]; }
      / "f" { return ["%c", "char(12)"]; }
      / "n" { return ["%c", "char(10)"]; }
      / "r" { return ["%c", "char(13)"];; }
      / "t" { return ["%c", "char(9)"]; }
      / "v" { return ["%c", "char(11)"]; }
      / "x" x:$([0-9A-Fa-f][0-9A-Fa-f]) { return ["%c", `char(0x${x})`]; }
      / "u{" x:$([0-9A-Fa-f]+) "}" { return ["%c", `char(0x${x})`]; }
      / "u" x:$([0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]) { return ["%c", `char(0x${x})`]; }
      / "u(" _ e:Expression _ ")" { return ["%c", `char(${e})`]; }
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

__ = boundary _

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

export const keywords = new Set([
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
].map(k => k.toLowerCase()));

export const erqKeywords = new Set([
  "abort",
  "add",
  "after",
  "alter",
  "analyze",
  "and",
  "apply",
  "array",
  "as",
  "asc",
  "ascending",
  "attach",
  "autoincrement",
  "axis",
  "before",
  "begin",
  "between",
  "bin",
  "binned",
  "boundary",
  "by",
  "case",
  "cast",
  "chan",
  "channel",
  "check",
  "collate",
  "column",
  "columns",
  "command",
  "comment",
  "commit",
  "concat",
  "conflict",
  "constraint",
  "count",
  "create",
  "cross",
  "csv",
  "current",
  "date",
  "datum",
  "day",
  "dayofyear",
  "default",
  "deferred",
  "delete",
  "delimiter",
  "dense",
  "desc",
  "descending",
  "detach",
  "distinct",
  "do",
  "drop",
  "else",
  "encoding",
  "end",
  "eqp",
  "equal",
  "escape",
  "event",
  "except",
  "exclude",
  "exclusive",
  "exists",
  "explain",
  "facet",
  "fail",
  "false",
  "file",
  "filter",
  "filters",
  "first",
  "following",
  "for",
  "foreach",
  "foreign",
  "format",
  "from",
  "full",
  "function",
  "generated",
  "geojson",
  "glob",
  "group",
  "groups",
  "hconcat",
  "header",
  "hours",
  "identifier",
  "if",
  "ignore",
  "image",
  "immediate",
  "in",
  "independent",
  "index",
  "inline",
  "inner",
  "insert",
  "instead",
  "intersect",
  "into",
  "is",
  "join",
  "json",
  "key",
  "language",
  "last",
  "lateral",
  "layer",
  "left",
  "legend",
  "less",
  "like",
  "limit",
  "limitOffset",
  "lite",
  "literal",
  "load",
  "mark",
  "match",
  "milliseconds",
  "minutes",
  "month",
  "more",
  "name",
  "natural",
  "ndjson",
  "no",
  "nominal",
  "nosort",
  "not",
  "nothing",
  "null",
  "nulls",
  "object",
  "of",
  "offset",
  "on",
  "options",
  "or",
  "order",
  "orderBy",
  "ordinal",
  "others",
  "output",
  "over",
  "pack",
  "partition",
  "plan",
  "png",
  "pragma",
  "preceding",
  "primary",
  "projection",
  "quantitative",
  "quarter",
  "query",
  "quote",
  "raise",
  "range",
  "raw",
  "rawblock",
  "recursive",
  "references",
  "regexp",
  "reindex",
  "relax",
  "release",
  "rename",
  "repeat",
  "replace",
  "resolve",
  "returning",
  "returns",
  "right",
  "rollback",
  "row",
  "rowid",
  "rows",
  "savepoint",
  "scale",
  "seconds",
  "select",
  "set",
  "shared",
  "size",
  "sniff",
  "sort",
  "space",
  "sparse",
  "spec",
  "sql",
  "stderr",
  "stdout",
  "stored",
  "strict",
  "string",
  "svg",
  "table",
  "temporal",
  "temporary",
  "then",
  "ties",
  "timeUnit",
  "to",
  "transform",
  "trigger",
  "true",
  "truncate",
  "type",
  "unbounded",
  "unique",
  "unpack",
  "update",
  "using",
  "utc",
  "vacuum",
  "valid",
  "value",
  "values",
  "variable",
  "vconcat",
  "vega",
  "view",
  "virtual",
  "week",
  "when",
  "where",
  "while",
  "window",
  "with",
  "without",
  "year",
]);

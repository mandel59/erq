# Functions

Erq supports all SQLite built-ins plus Erq-specific scalar and table functions.

## Common scalar functions

- Math/strings: `abs`, `round`, `sin`, `cos`, `substr`, `length`, `printf`, etc. (SQLite-compatible)
- Types/info: `typeof`, `json(...)` (convert JSON text to a JSON value)
- Hash/encoding: `md5`, `sha1`, `sha256`, `btoa`, `atob`
- String processing: `normalize(str[, form])`, `split_part(string, delimiter, count)`
- Enums: `to_enum(value, ...alts)`, `from_enum(index, ...alts)`
- RegExp: `regexp(pattern, string)`, `regexp_replace`, `regexp_substr`

Aggregates (evaluated per group):

- `count()`, `sum(expr)`, `avg(expr)`, `max(expr)`, `min(expr)`
- `group_concat(expr [order by ...])` (ordered concatenation)

Window functions (example):

- `row_number()` with `over(partition by ... order by ...)`

```erq
range(1, 6)
  { value, rn: over(partition by value % 2 order by value desc) row_number() };;
```

## Table functions

- `range(start, end[, step])` generate sequences (integers/floats)
- `linear_space(start, end, num)` equally spaced values
- `string_split(string, delimiter)` split into characters or delimited parts

```erq
range(1, 3);;              -- 1, 2, 3
linear_space(0, 1, 5);;    -- 0.0, 0.25, 0.5, 0.75, 1.0
string_split('a,b,c', ',');;
```

## Module functions

Load modules like `iconv` and call namespaced functions such as `iconv::encode`/`decode`.

```erq
load module iconv;;
{ wrong: 'abc' } { *, blob: iconv::encode(wrong, 'utf-8') };;
```

Note: available functions may expand over time. Refer to examples and tests when in doubt.

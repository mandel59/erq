# Erq Language Reference — File Structure

This directory splits the language reference into small, focused topics. Start at `index.md` for the overview and table of contents.

- index.md — Overview, execution model, table→pipeline concept, TOC
- basics.md — Statement terminator `;;`, identifiers, comments, quoting, table-expression basics
- table-operations/mapping.md — Column selection, aliases, `*`, per-column `asc/desc` vs query-level `order by`
- table-operations/filtering.md — `[]` filters and `where`, chaining and evaluation order
- table-operations/grouping-aggregation.md — `{keys => aggs}` syntax, `group by ... select`, aggregates overview, `distinct`
- table-operations/joining.md — `join ... on`, `using (...)`, `natural join`, join types (left/right/full/inner/cross)
- expressions/literals.md — Numbers, strings, escape strings `E'...'`, arrays/objects, `values` literal
- expressions/operators.md — Arithmetic, comparison, logical, concatenation `||`, `in`, `exists`, `glob`, `not`, precedence
- expressions/functions.md — SQLite builtin functions, Erq builtin functions
- expressions/subqueries.md — Value subqueries with `from`, omission after `in`/`exists`, parentheses for table subqueries
- ctes-recursion.md — `with ... as (...)`, recursive patterns, `view recursive`
- ddl-dml.md — `create table` (types/constraints/`strict`/`without rowid`), `insert`/`insert or replace`/`<-`, `update`, `delete`
- user-functions.md — `create function` (scalar, JS), `create table function` (tabular, `returns (...)`, `yield` in JS)
- json.md — `create table ... from json (...)`, `pack`/`unpack`, `json()`, `json_each` for array traversal
- data-loading.md — `load table ... csv/ndjson`, `header`, column type affinities
- output-visualization.md — `output raw`, `output vega lite with`, `format ... png`, `output to` paths
- control-flow.md — `while (...) (...)`, `if ... then ... else ...`, `case ... when ... end`, `foreach` and `@var`
- generators.md — `range(...)` and other table generators
- types.md — Type affinities (text/numeric/integer/real/blob), `typeof`, implicit conversions
- patterns.md (optional) — Recipe-style examples (transitive closure, Mandelbrot, ETL)

Notes:

- Use the examples in the `examples` directory as references when authoring the manual.
- When adding sample code, verify with the `erq` command. You can feed an Erq script via a HEREDOC and inspect the output.

Progress (high-level):

- [x] Index and basics
- [x] Table operations: from/values/mapping/filtering/grouping/joining
- [x] Expressions: literals/operators/functions/subqueries
- [x] CTEs and recursion; DDL/DML; JSON; data loading; output
- [ ] Control flow; Generators; Types; User functions; Patterns

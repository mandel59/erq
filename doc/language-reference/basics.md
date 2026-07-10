# Basics

Core syntax and conventions in Erq.

- Statement terminator: end each statement with `;;`. Multi-line statements also require a trailing `;;`.
- Identifiers: use letters, digits and `_`. Quote names containing spaces/symbols/reserved words with backticks `` `...` ``.
- Comments: line comments start with `--`; block comments use `/* ... */`.
- Strings: `'SQL-compatible'`, `"JSON-compatible"`, and escaped strings like `E'line\nbreak'` are supported.
- Case: keywords are case-sensitive; identifiers are case-insensitive.

One row and one column table expression:

```erq
{greeting: 'Hello'};;
```

Chain operations in a left-to-right pipeline:

```erq
employees
  [salary > 100]
  {name, department}
  order by name asc
  limit 20;;
```

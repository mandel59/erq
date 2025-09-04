# Mapping Columns `select`

A mapping operation creates a new table from another table.

You can use a brace form or an explicit `select` clause:

```erq
employees {name, salary};;
employees select name, salary;;
```

Each column can specify an alias and sort order, and `*` selects all columns:

```erq
employees {name, salaryUSD: salary desc};;
```

- `alias: expression` renames an expression.
- `asc`/`desc` can follow an expression to control ordering.
- `*` selects all columns.

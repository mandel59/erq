# Creating New Table `values`

Use the `values` operation to create a new table by listing row values or expressions directly.

```erq
values (name, age) [
  {'Alice', 21},
  {'Bob', 19},
  {'Lisa', 24},
];;
```

```
values ( <column name>, ... ) [
  { <expression>, ... },
  { <expression>, ... },
  { <expression>, ... },
]
```

An expression can be a literal value or a formula.

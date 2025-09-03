# Table expressions

Erq supports table expressions (subqueries) in value (scalar) position and table position.

## Table expressions in value position (Scalar subqueries)

Use `from <table-expr>` to extract a single value (one row, one column).

```erq
{x: from range(1, 10)[value between 3 and 7] order by value desc limit 1};;
```

## Table expressions in `exists` and `in` expressions

Predicates like `exists <table-expr>` and `x in <table-expr>` are also supported.

```erq
{
  p: exists range(1, 10)[value = 7],
  q: 7 in range(1, 10),
};;
```

## Table expressions in table position (Table subqueries)

Wrap a table expression in parentheses and use it with joins and aliases.

```erq
even: (range(1, 6)[value % 2 = 0])
  join odd: (range(1, 6)[value % 2 = 1])
  {x: even.value, y: odd.value, sum: even.value + odd.value}
  [sum < 10];;
```

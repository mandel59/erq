# CTEs and Recursion

Common table expressions (CTEs) and recursion.

## with / with recursive

Define a temporary table with `with name(cols) as (<table-expr>)` and reference it in the following expression. Add `recursive` to allow self-reference.

```erq
table fib_table =
  with recursive t(x, y) as ({1,1}; t{y, x+y} limit 5)
    t{x};;

fib_table;;
```

You can also capture a CTE as a reusable view.

```erq
view fib_view =
  with recursive t(x, y) as ({1,1}; t{y, x+y})
    t{x};;

fib_view limit 5;;
```

`view recursive` / `table recursive` declares that the right-hand table expression can recursively reference itself.

```erq
table recursive seq_table = {x: 1}; seq_table{x+1} limit 5;;
view  recursive seq_view  = {x: 1}; seq_view{x+1};;
```

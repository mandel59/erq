# Language Reference

This reference describes the Erq query language. Queries start from a table expression and apply a series of operations (filters and transforms) left to right.

## Basics

Erq is a database query language like SQL, but expressed as a left-to-right pipeline.

In SQL, you might write:

```sql
SELECT department, avg(salary) AS avgSalary
  FROM employees
  JOIN departments AS d USING (department)
  WHERE d.region = 'Europe'
  GROUP BY department
  HAVING avgSalary >= 100
  ORDER BY avgSalary DESC
  LIMIT 10;
```

SQL clauses are fixed in order. To apply steps in a different order, you typically resort to subqueries. In Erq, you apply table operations left to right:

```erq
employees
  join d: departments using (department)
  [d.region = 'Europe']
  {department => avgSalary: avg(salary) desc}
  [avgSalary >= 100]
  limit 10;;
```

You can place joins, filters, grouping, ordering and limits in one pipeline, in the order that fits your thinking. Newlines and indentation are optional and purely for readability.

## Table of Contents

### Table Operations

- [Creating New Table `values`](./table-operations/values.md)
- [Mapping Columns `select`](./table-operations/mapping.md)
- [Filtering Rows `where`](./table-operations/filtering.md)
- [Grouping and Aggregation `group by`](./table-operations/grouping-aggregation.md)
- [Joining Tables `join`](./table-operations/joining.md)

### Expressions

- [Literals](./expressions/literals.md)
- [Operators](./expressions/operators.md)
- [Functions](./expressions/functions.md)
- [Subqueries](./expressions/subqueries.md)

### Other Topics

- [Basics](./basics.md)
- [CTEs and Recursion](./ctes-recursion.md)
- [DDL and DML](./ddl-dml.md)
- [JSON and Packing](./json.md)
- [Data Loading](./data-loading.md)
- [Output and Visualization](./output-visualization.md)
- [Control Flow](./control-flow.md)
- [Generators](./generators.md)
- [Types](./types.md)

# Grouping and Aggregation `group by`

A grouping operation uses brace-arrow syntax to separate grouping keys from selected aggregates:

```erq
employees {department => avgSalary: avg(salary)};;
```

- Left side of `=>` lists grouping keys.
- Right side lists expressions evaluated per group.
- Omitting the right side selects only the grouping keys.

An alternative form uses `group by` keyword followed by `select`:

```erq
employees group by department select department, avg(salary);;
```

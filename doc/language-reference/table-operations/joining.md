# Joining Tables `join`

A joining operation combines rows from multiple tables.
Supported forms include `join`, `join ... using (...)`, and `natural join`.

```erq
e: employees join d: departments on e.department_id = d.id;;
employees join departments using (department);;
```

Join types (`left`, `right`, `full`, `inner`, `cross`) may precede `join`:

```erq
employees left join departments on employees.department_id = departments.id;;
```

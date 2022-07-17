# Erq - Easy Relational Query Language

No more SELECT in your queries.

## Syntax comparison

---

```sql
SELECT *
FROM employees
```

```eql
employees
```

---

```sql
SELECT id, name, birth
FROM employees
WHERE birth < '2000-01-01'
```

```erq
employees
[birth < '2000-01-01']
{id, name, birth}
```

Erq use brackets for restriction and braces for projection.

--- 

```sql
SELECT e.id, sum(s.value) AS total
FROM employees AS e
JOIN salary AS s ON s.employee_id = e.id
WHERE s.date BETWEEN '2020-01-01' AND '2020-12-31'
GROUP BY e.id
HAVING total >= 10000 
ORDER BY total DESC
```

```erq
e: employees
join s: salary on (s.employee_id = e.id)
[s.date between '2020-01-01' and '2020-12-31']
{e.id => total: sum(s.value) desc}
[total >= 10000]
```

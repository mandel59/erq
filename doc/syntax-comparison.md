# Syntax Comparison with SQL

## `SELECT` Statement

### SQL

```sql
SELECT * FROM employees;
```

### Erq

```erq
employees;;
```

- Just type the name of the table and the query is done.
- Two semicolons are needed to end the statement. (Single semicolon is used for table concatenation.)

---

### SQL

```sql
SELECT id, name, birth
FROM employees
WHERE birth < '2000-01-01';
```

### Erq

```erq
employees
  [birth < '2000-01-01']
  {id, name, birth};;
```

- Curly braces are for projection. (`SELECT` clause)
- Square brackets are for restriction. (`WHERE` clause)

--- 

### SQL

```sql
SELECT e.id, sum(s.value) AS total
  FROM employees AS e
JOIN salary AS s ON s.employee_id = e.id
WHERE s.date BETWEEN '2020-01-01' AND '2020-12-31'
GROUP BY e.id
HAVING total >= 10000 
ORDER BY total DESC;
```

### Erq

```erq
e: employees
  join s: salary on s.employee_id = e.id
  [s.date between '2020-01-01' and '2020-12-31']
  {e.id => total: sum(s.value) desc}
  [total >= 10000];;
```

- Colon `:` is for renaming. (`AS` clause)
- Brace-arrow syntax `{ ... => ... }` is for grouping. (`GROUP BY` clause)
- Optional keyword `desc` is for ordering. (`ORDER BY` clause)  
- Square brackets are used for restriction. (`WHERE` and `HAVING` clauses. No `HAVING` keyword is needed.)

---

### SQL

```sql
SELECT employee_id, date, value
  FROM (SELECT employee_id, MAX(date) AS date
        FROM salary
        GROUP BY employee_id)
  NATURAL JOIN salary;
```

### Erq

```erq
salary
  {employee_id => date: max(date)}
  natural join salary
  {employee_id, date, value};;
```

Operations are applied successively from left to right.

This example first selects the latest salary date for each employee, then joins the result with the original salary table, and finally selects the columns `employee_id`, `date`, and `value`.

## `VALUES` Statement

### SQL

```sql
VALUES (1, 'John'), (2, 'Jane'), (3, 'Jack');
```

### Erq

```erq
values [
  {1, 'John'},
  {2, 'Jane'},
  {3, 'Jack'},
];;
```

Records are separated by a comma `,` and each of them are enclosed by curly braces `{}`. Whole record list is enclosed by square brackets `[]`.

#### Values with column name

```erq
values(id, name) [{1, 'John'}, {2, 'Jane'}, {3, 'Jack'}];;
```

Column names can be specified in parentheses.

#### JSON-like syntax

```erq
values [
  {"id": 1, "name": "John", attrs: {"age": 20}},
  {"id": 2, "name": "Jane"},
  {"id": 3, "name": "Jack", attrs: {"age": 30}},
];;
```

JSON-like syntax is also supported. This is useful when you want to copy and paste values from JSON.

#### Empty values

```erq
values(x) [];;
```

Values can be empty.

## `CREATE TABLE` Statement

### SQL

```sql
CREATE TABLE salary (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL,
  date DATE NOT NULL,
  value INTEGER NOT NULL
);
```

### Erq

```erq
create table salary (
  id integer primary key,
  employee_id integer not null,
  date date not null,
  value integer not null
);;
```

---

### SQL

```sql
CREATE TABLE average_salary AS
  SELECT employee_id, avg(value) AS value
  FROM salary
  GROUP BY employee_id;
```

### Erq

```erq
table average_salary = salary {employee_id => value: avg(value)};;
```

Creating table with query looks like just a regular assignment.

## `INSERT` Statement

### SQL

```sql
INSERT INTO salary (employee_id, date, value)
VALUES
  (1, '2020-01-31', 10000),
  (2, '2020-01-31', 20000),
  (3, '2020-01-31', 30000),
  (1, '2020-02-28', 15000),
  (2, '2020-02-28', 25000),
  (3, '2020-02-28', 35000);

SELECT employee_id, date, value FROM salary;
```

### Erq

```erq
salary {employee_id, date, value} <- values [
  {1, '2020-01-31', 10000},
  {2, '2020-01-31', 20000},
  {3, '2020-01-31', 30000},
  {1, '2020-02-28', 15000},
  {2, '2020-02-28', 25000},
  {3, '2020-02-28', 35000},
];;

salary {employee_id, date, value};;
```

`<-` is used for insertion.

## `UPDATE` Statement

### SQL

```sql
UPDATE salary
  SET
    value = TRUNC(value * 1.1),
    date = '2020-02-29'
  WHERE date = '2020-02-28';

SELECT * FROM salary WHERE date = '2020-02-29';
```

### Erq

```erq
update salary[date = '2020-02-28']
  set value = trunc(value * 1.1)
  set date = '2020-02-29';;

salary[date = '2020-02-29'];;
```

## `DELETE` Statement

### SQL

```sql
DELETE FROM salary WHERE date = '2020-02-29';
```

### Erq

```erq
delete salary[date = '2020-02-29'];;
```

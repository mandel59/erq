# DDL and DML

Creating, modifying, and deleting data and tables.

## CREATE TABLE

```erq
create table t(id integer primary key, name text, value integer);;
```

- SQLite modifiers like `strict` and `without rowid` are supported where appropriate.

## INSERT

Insert multiple rows using [`values` operation](./table-operations/values.md).

```erq
insert into t(id, name, value) values [
  {1, "foo", 10},
  {2, "bar", 20},
  {3, "baz", 30}
];;
```

## UPDATE

```erq
update t[id = 1] set {name, value} = {"quux", 40};;
```

## DELETE

```erq
delete t[id = 1];;
```

## Upsert / Insert-Select assignment

Use `<-` as sugar to assign the result of a table expression into a table. Can be combined with `on conflict ... do update`.

```erq
t {id, name, value} <- values [
  {2, "hoge", 200},
  {4, "fuga", 400}
] on conflict(id) do update
  set {name, value} = {excluded.name, excluded.value};;
```

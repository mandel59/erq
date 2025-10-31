# 課題: 外部キー対応

create table 文を外部キーに対応させる。

Erq

```erq
create table t1 (t1_id integer primary key, col1 text);;
create table t2 (t2_id integer primary key, col2 integer references t1 (t1_id));;
create table t3 (t3_id integer primary key, col3 integer, foreign key (col3) references t1 (t1_id));;
```

これは次のSQLに相当する。

```sql
create table t1 (t1_id integer primary key, col1 text);
create table t2 (t2_id integer primary key, col2 integer references t1 (t1_id));
create table t3 (t3_id integer primary key, col3 integer, foreign key (col3) references t1 (t1_id));
```

## 実施事項

- [x] erq.pegjs の内容を編集
- [x] テストを実装
- [x] examples/ にスクリプト例を追加

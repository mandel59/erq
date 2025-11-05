# 課題: バグのような挙動の修正

いくつかのケースで、使いづらい挙動がある。修正を行いたい。

ケース1. 

```console
❯ ERQ_DEBUG=sql erq --init examples/correlate.erq <<<'article as a join ^comment;;'
Connected to :memory:
create table if not exists article (id integer primary key, title text not null)
ok (0.006s)
create table if not exists comment (id integer primary key, article integer not null references article (id), message text not null)
ok (0.000s)
insert into article values (1, 'First Post'), (2, 'Second Post')
2 rows changed, lastInsertRowid=2 (0.000s)
insert into comment values (1, 1, 'Nice read!'), (2, 1, 'Thanks for sharing'), (3, 2, 'Looking forward to more!')
3 rows changed, lastInsertRowid=3 (0.000s)
select id, title, exists (select * from comment where ((comment.article = article.id))) as has_comment from article
["id","title","has_comment"]
[1,"First Post",1]
[2,"Second Post",1]
2 rows (0.000s)
select id, (select title from article where ((comment.article = article.id))) as article_title, message from comment
["id","article_title","message"]
[1,"First Post","Nice read!"]
[2,"First Post","Thanks for sharing"]
[3,"Second Post","Looking forward to more!"]
3 rows (0.000s)
select * from (select * from article) as a join comment
["id","title","id","article","message"]
[1,"First Post",1,1,"Nice read!"]
[1,"First Post",2,1,"Thanks for sharing"]
[1,"First Post",3,2,"Looking forward to more!"]
[2,"Second Post",1,1,"Nice read!"]
[2,"Second Post",2,1,"Thanks for sharing"]
[2,"Second Post",3,2,"Looking forward to more!"]
6 rows (0.000s)

```

このケースでは `^comment` のように自動相関テーブルとして指定しているにもかかわらず、生成されたSQLでは

```
select * from (select * from article) as a join comment
```

のように、条件が全く生成されていない。

おそらく、内部的に `... as t` 構文の部分で、テーブルのコンテキストがうまく引き継がれていない。

注意が必要なケース

`p as t join ^r`

このケースでは、テーブル `p` にエイリアス `t` が与えられたものとして外部キーをルックアップしてよい。

`p join q as t join ^r`

このケースでは `p join q` にエイリアス `t` が与えられているので `p` や `q` のカラムを `t.col` のように参照するのは問題がある。このケースでは、エラーにしてよい。

ケース2.

examples/correlate.erqをinitスクリプトに使ったErq CLIで:

```console
erq> article[id=1] join ^comment;;
select * from article join comment on (comment.article = article.id) where (id = 1)
SqliteError: ambiguous column name: id
```

articleとcommentは同名のidカラムを持っている。そのため、 `[id=1]` という指定がエラーになってしまう。

生成されるSQLを見ればわかるが `id = 1` という条件はトップレベルのselectに持ち上げられているので、joinされている `comment` もカラム捜査の対象になる。使い勝手を向上させるため、次のようなSQLを生成するように改修する。

```
select * from (select * from article where (id = 1)) as article join comment on (comment.article = article.id)
```

注意点として、もとのErqにはないエイリアス指定 `as article` と、自動相関クエリ `^comment` に対応する条件 `(comment.article = article.id)` がSQLで生成されている。

## 対応内容

- `TableBuilder` に基底テーブル向けフィルタの取り回しを追加し、join 前にサブクエリ化することで `[id=1]` などの条件が結合先へ広がらないようにした。
- `as` でエイリアスを付与した際に相関テーブルのコンテキストを引き継ぐよう調整し、単一テーブルへのエイリアスでのみ関連キーが解決されるよう制限を加えた。
- `TableUnion` からエクスポートするテーブルコンテキストを見直し、複合エイリアスでは自動相関を禁止する挙動を追加した。
- CLI で期待どおりの SQL が生成されることと、`tests/test.js` に回帰テスト（エイリアス/フィルタ/エラーケース）を追加。

## 実施したテスト

- `npm run test:unit`

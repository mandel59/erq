# 課題: 自動相関サブクエリ機能の実装

テーブルの外部キー定義を参照し、相関サブクエリの制約を自動的に実行する。

```erq
create table article (
  id integer primary key,
  title text not null,
);;
create table comment (
  id integer primary key,
  article integer not null references article (id),
  message text not null,
);;

article[exists ^comment];;

comment[id=1]{ title: ^article{title}, message };;
```

`article` テーブル参照に続くフィルタ類では `^comment` のような記法が使える。
この記法は `comment` テーブルがコンテキストに対して外部キーである関係を持っているとき、
自動で相関クエリにする。

具体的には、クエリ実行前に `pragma_foreign_key_list` を使って `article` と `comment` の間の外部キー関係を調べる。

```sql
select id, json_group_array(`from`), json_group_array(`to`) from pragma_foreign_key_list('article') where (`table` = 'comment') group by (id);

select id, json_group_array(`from`), json_group_array(`to`) from pragma_foreign_key_list('comment') where (`table` = 'article') group by (id);
```

その結果として、外部キーとして唯一 `comment.article` と `article.id` の間の参照関係があるので、

```erq
article[exists ^comment];;
```

は

```erq
article[exists comment[comment.article=article.id]];;
```

というErqクエリと同等のSQLに変換する。すなわち、

```sql
select * from article where (exists (select * from comment where (comment.article = article.id)))
```

のようになる。同様に

```erq
comment[id=1]{ title: ^article{title}, message };;
```

は

```erq
comment[id=1]{ title: from article[comment.article=article.id]{title}, message };;
```

というErqクエリと同等のSQLに変換する。

## 実装方針

SQLプリプロセス機能を拡張して実装する。動的なSQL生成を実現するため、パーサーはプリプロセスコマンドを出力することができる。
プリプロセスコマンドはsrc/eval-utils.jsのpreprocess関数で実装されている。

このプリプロセス処理を改造したら、どうにか実装できるかも。

```pegjs
CorrelateTable
  = "^" _ n:Name _ "." _ m:ModulePathName {
    const t = modulePathNameToSQLName(m);
    return {
      name: t,
      expression: `${n}.${t}`,
      schema: n,
      correlate: t,
    };
  }
  / "^" _ m:ModulePathName {
    return {
      name: t,
      expression: t,
      schema: null,
      correlate: t,
    };
  }
```

は相関テーブル式。 TableExpressionに文法を追加。

TableReferenceの定義もschema, correlateの値が渡るように修正する。

TableBuilderの定義もどうにか修正する。

やりたいのは、TableBuilderに渡されたTableReferenceがcorrelateを持っているとき、#whereに中間プリプロセス命令 `^` を追加する。

うまく定義を修正すれば、

```erq
u: ^s.t {c}
```

からは

```sql
select c from s.t as u where (␀^["s","t","u"]␀)
```

のように、ヌル文字で括られたプリプロセス命令が埋め込まれたSQLが生成される。

このような中間プリプロセス命令が含まれたSQLが、TableBuilderのメソッドに渡されてくるので、TableBuilderは中間プリプロセス命令を編集し、プリプロセス命令 `c` に置換する。このような処理を入れることで、

```erq
v: f { from u: ^s.t {c} }
```

のようなErqの式は

```sql
select (select c from s.t where (␀c[[null, "f", "v"],["s","t","u"]]␀)) from f as v
```

のようなSQLに変換されることになる。

あとは、preprocess関数でプリプロセス命令 `c` を処理してやる。つまり、
`pragma_foreign_key_list('t', 's')` と `pragma_foreign_key_list('f')` を使って外部キー参照を調べ、外部キー関係がひとつだけ存在すれば、その外部キー関係を元に等式に置換する。（`pragma_foreign_key_list` テーブル値関数の引数はテーブル名、スキーマ名（オプショナル）の順番）

テーブルのスキーマ省略されている場合は先に `select schema from pragma_table_list where (name = 'f')` のようにしてスキーマを調べるべきかもしれない。なんにせよ、うまいことプラグマを活用して、s.t が foreign key (a, b) references main.f (p, q) のような関係を取得できたら、与えられたエイリアスを使って（エイリアスがnullの場合はテーブル名を使って） `(u.a, u.b) = (v.p, v.q)` のような式を生成してやる。

最終的に、プリプロセス命令が置換されて

```sql
select (select c from s.t where ((u.a, u.b) = (v.p, v.q))) from f as v
```

のように変換されればOK。

## 実施内容

- `^` 付きテーブル参照を `CorrelateTable`/RowValue の新規文法で受け付けるようにし、`TableReference` から `TableBuilder` へ相関メタデータ（スキーマ・テーブル・エイリアス）を伝搬させる実装を追加
- `TableBuilder` に関連コンテキストを保持させ、中間命令 `^` を親コンテキストに応じた `c` 命令へと置換する処理、および各種演算子でのヌル命令展開を実装
- `eval-utils.preprocess` に新しいプリプロセス命令 `c` を追加し、`pragma_foreign_key_list` 等を用いて一意な外部キー対応を探索して結合条件（単一・複合キー双方対応）を生成するロジックを実装
- 相関サブクエリの利用例と両方向（親→子 / 子→親）のパターンを検証するテストケース `tests/testcases/basic/correlate.{erq,parsed.json}` を追加
- 同機能を紹介するサンプル `examples/correlate.erq` を追加し、`^table` を使った exists/選択例を掲載

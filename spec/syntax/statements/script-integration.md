# SQLite ステートメントとの統合 (`Statement1`)

`Statement1` 規則は、SQLite の主要ステートメントを Erq スクリプト内で表現するためのラッパーです。  
文法上はほぼ SQLite の構文を再利用しつつ、Erq の DSL（`Table`、`FormatClause`、`BlockStatement` 等）と組み合わせられるようになっています。

```ebnf
Statement1 ::= Attach
             | Detach
             | Create
             | Alter
             | Drop
             | Truncate
             | Vacuum
             | Pragma
             | Begin
             | Savepoint
             | Release
             | Commit
             | Rollback
             | Analyze
             | Reindex
             | ("do" WS)? Table ForEachClause
             | ("do" WS)? Table ParallelClause
             | TriggerStatement (WS FormattingClause)?
```

以下では主なステートメントの構文上の特徴を説明します。

## `attach` / `detach`

```ebnf
Attach ::= ("do" WS)? "attach" WS Expression WS "as" WS Name
Detach ::= ("do" WS)? "detach" WS Name
```

- `do attach` と書くと `("do" WS)?` にマッチ。`Expression` には文字列リテラルだけでなく任意の式が利用できます。

## `create`

`Create` 規則は複数の分岐を持ち、テーブル・ビュー・インデックス・トリガー・仮想テーブルなどをサポートします。代表的な形を EBNF で示すと次のとおりです。

```ebnf
Create ::= ("do" WS)? "create" WS ("temporary" WS)? CreateBody

CreateBody ::= "table" WS TableName WS "as" WS Table
             | "table" WS TableName WS "(" WS TableDef WS ")" (WS TableOptions)?
             | "table" WS TableName WS "=" WS Table
             | ("unique" WS)? "index" WS IndexName WS "on" WS Name "(" WS IndexedColumns WS ")" (WS "where" WS Expression)?
             | "virtual" WS "table" WS TableName WS "using" WS ModuleName "(" ModuleArguments ")"
             | "trigger" WS TriggerName TriggerDefinition
```

- `create table ... as` は `Table` 式をそのまま `CREATE TABLE AS SELECT` に展開します。
- `create table ... (...)` では列定義と制約を列挙します。
- `create trigger` は `begin ... end` ブロック内に複数ステートメントを並べられます。
- `table = Table` の記法は簡潔に CTE からテーブルを定義するための糖衣です。

## `alter`, `drop`, `truncate`

- `Alter ::= ("do" WS)? "alter" WS "table" WS TableName WS AlterAction`（`rename to`, `rename column`, `add`, `drop` など）。
- `Drop ::= ("do" WS)? "drop" WS ("temporary" WS)? ObjectKind ("if exists")? WS TableName`。
- `Truncate` は `delete from` を簡潔に表現する糖衣です。

## DML (`insert`, `update`, `delete`, `select`)

- `Insert` – `insert into table <- Table` という逆矢印記法を備え、`with` 句・`on conflict`・`upsert` も利用可能。
- `Update` / `Delete` / `Select` – PEG 定義が長いため本ドキュメントでは割愛しますが、`Table` 規則や `Expression` 規則を内部的に利用し、SQLite に近い構文を提供します。

## `pragma`, `analyze`, `vacuum`, `reindex`

- どれも SQLite の構文をほぼそのまま受け付けます。たとえば `pragma journal_mode = wal;;` のように記述します。

## トリガーステートメントと出力句

- `TriggerStatement` は `insert`/`update`/`delete`/`select` のトリガー専用バリエーションです。
- `FormattingClause` を伴うと、単一クエリに対して `output format ...` / `output to ...` を設定できます（[`output.md`](./output.md) 参照）。

## 制御句との橋渡し

- `("do" WS)? t:Table ForEachClause` / `ParallelClause` の分岐により、`table ... for each` / `table ... parallel` といった構文が `Statement1` でも利用できます。解析後は制御構文と同じ `{ type: "for" | "parallel", ... }` 形式になります。
- これにより、SQL テーブル表現と Erq の制御構文がなめらかに結合されます。

## 実行時の取り扱い

- `query` フィールドに格納された文字列は `runSqlsWithEnv` で `preprocess` を通し、SQLite に実行されます。
- `type` フィールドに `select` が設定された場合、`outputFormat` や `FormattingClause` の情報を参照して結果を整形します。
- `attach` / `detach` などは副作用ステートメントとしてそのままデータベースに送られます。

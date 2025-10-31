# テーブル式 (`Table` 規則)

`Table` は FROM 句で利用されるテーブル式を表し、Erq の DSL によるクエリ合成の中心となります。ここでは PEG の実装詳細を省き、EBNF 風の表記で構造を整理します。

## エントリポイント

```ebnf
Table ::= WithTable
        | ("from" WS)? TableUnion
```

- `with` から始まる場合は CTE (`WithTable`) として解釈されます。
- それ以外は `TableUnion` を解析し、`from` キーワードは省略可能です。

## CTE (`WithTable`, `WithClause`)

```ebnf
WithTable ::= WithClause+ Table
WithClause ::= "with" WS ("recursive" WS)? Name
               (WS "(" ColumnNameList ")")?
               WS "as" WS "(" WS Table WS ")"
```

- 複数の CTE をカンマで接続できます。
- 列リストを指定すると `cte(col1, col2)` の形式になります。
- 本体には任意の `Table` 式を記述可能で、再帰 CTE もサポートします。

## `TableUnion`

```ebnf
TableUnion ::= ConcatenatedTables
               (ExceptIntersectTable*)?
               DistinctClause?
               OrderClause?
               LimitOffsetClause?
               AsClause?
               Filters?
```

- `ConcatenatedTables` は `Table1 (";" Table1)*` に等しく、`union` / `union all` を挿入して結合します。
- `ExceptIntersectTable` では `except` / `intersect` 節を追加可能です。
- `DistinctClause`, `OrderClause`, `LimitOffsetClause`, `AsClause` は標準的な SQL の後置修飾です。
- `Filters` には `where`, `group by`, `having`, `join`, `window` などの付随句が含まれ、順番に適用されます。

### 主な補助規則

- `DistinctClause ::= WS "distinct" ("on" WS "(" ExpressionList ")")?`
- `OrderClause ::= WS "order" WS "by" WS OrderingTerm (WS "," WS OrderingTerm)*`
- `LimitOffsetClause ::= WS "limit" WS Expression ("offset" WS Expression)? | WS "offset" WS Expression WS "limit" WS Expression`
- `AsClause ::= WS "as" WS Name`

## `Table1` と `Table2`

```ebnf
Table1 ::= Table2 (WS Filters)?

Table2 ::= "select" WS ValueReferences
         | "{" WS ValueReferences WS "}"
         | ValuesList
         | Literal
         | TableReference
```

- `select` で始まる場合は通常の SELECT を表現します。
- `{ ... }` は `ValueReferences` を用いた簡易 SELECT 記法です。`table users { id, name }` のように書けます。
- `ValuesList` や単一の `Literal` をテーブルとして扱うこともできます。
- `TableReference` は既存のテーブル名やテーブル値関数の呼び出しを表します。

## 値リスト (`ValuesList`)

```ebnf
ValuesList ::= "values" WS (ColumnNameList WS)? "[" WS RowList WS "]"
             | "values" WS ColumnNameList WS "[" WS "]"
             | "values" WS "[" WS QuasiJsonObjectEntries WS "]"
RowList     ::= (Record | Expression) (WS "," WS (Record | Expression))*
Record      ::= "{" WS ExpressionList WS "}"
```

- `values ( {1, "foo"}, {2, "bar"} )?` のように配列形式で行を列挙できます。
- 列リストを指定すると `select null as ... where 0 union all values ...` に展開され、列名を固定できます。
- `QuasiJsonObjectEntries` を使うとキー付きの疑似 JSON からテーブルを生成できます。

## テーブル参照 (`TableReference`)

```ebnf
TableReference ::= Name ":" TableExpression
                 | TableExpression
TableExpression ::= "{" WS ValueReferences WS "}"
                 | "(" WS Table1 WS ")"
                 | "(" WS Table WS ")"
                 | "lateral" WS "values" WS "(" WS Expressions WS ")"
                 | ValuesList
                 | Literal
                 | ModuleQualifiedName ( "(" ExpressionList? ")" )?
```

- `Name ":" ...` と書くと明示的に別名を与えられます。
- `ModuleQualifiedName` は `module::function` といった表現でモジュールが提供するテーブル値関数を呼び出します。
- `lateral values (...)` は `serialize_values`/`deserialize_values` を用いたレコード展開に対応します。

## フィルタと付随句 (`Filters`)

```ebnf
Filters ::= Filter (WS Filter)*

Filter ::= "[" WS Expression WS "]"               -- where
         | "where" WS Expression
         | "select" WS ValueWildCardReferences
         | "group" WS "by" WS ValueReferences WS "select" WS ValueWildCardReferences
         | "{" WS ValueReferences WS "=>" WS ValueWildCardReferences WS "}"
         | JoinClause
         | WindowClause
```

- `Select` や `group by` の糖衣構文で投影や集計を切り替えられます。
- `JoinClause` には以下の形が含まれます。

```ebnf
JoinClause ::= JoinType? WS "join" WS TableReference WS "using" WS "(" NameList ")"
             | JoinType? WS "join" WS TableReference ("on" WS Expression)?
             | "natural" WS "join" WS TableReference
             | JoinType? WS "-:" WS Name (WS ":" WS Name)? WS ":>" WS TableReference
JoinType   ::= "left" | "right" | "full" | "inner" | "cross"
```

- `-: key :> table` は結合条件を簡潔に書くための糖衣構文です。
- `WindowClause` は `window name as (...)` の形式でウィンドウ定義を追加します。

## テーブル名と変数

```ebnf
TableNameWithVariable ::= Name "." Variable
                        | Variable
                        | QualifiedName
Variable ::= "@" Identifier
```

- `@tableName` 形式を使うと、実行時に環境変数からテーブル名を差し込みできます。
- `QualifiedName` は `schema.table` の形式です。

## 実行時の取り扱い

- すべての構文は最終的に SQL 文字列へ正規化され、SQLite に送られます。
- `Filters` や `JoinClause` は解析段階で `TableBuilder` に変換され、順序通りに適用されます。
- 制御構文（`for each` / `parallel`）と組み合わせる場合は、それぞれの節で紹介したルールに従ってテーブル式と束縛を接続します。

# テーブル式の部品 (`TableExpression`, `Filters`, `ValueReferences`)

`Table` 規則を構成する補助規則を EBNF 形式で整理します。これらは投影列、JOIN、WHERE などの DSL を表現するために使用されます。

## `TableExpression` と `TableReference`

```ebnf
TableExpression ::= "{" WS ValueReferences WS "}"
                  | "(" WS Table1 WS ")"
                  | "(" WS Table WS ")"
                  | "lateral" WS "values" WS "[" WS Expressions WS "]"
                  | ValuesList
                  | Literal
                  | ModuleQualifiedName ("(" ExpressionList ")")?
                  | ModuleQualifiedName

TableReference ::= Name ":" TableExpression
                 | TableExpression
```

- `{ ... }` は列リストを用いた簡易 SELECT を表現します。
- `lateral values (...)?` は VALUES の結果を行として展開する糖衣構文です。
- `ModuleQualifiedName` (`module::table`) を使うとモジュール提供のテーブル値関数を呼び出せます。

## `ValueReferences`

```ebnf
ValueReferences ::= ValueReferenceOrUnpack (WS "," WS ValueReferenceOrUnpack)*
ValueReferenceOrUnpack ::= ValueReference | Unpack

ValueReference ::= Name WS ":" WS Expression (WS SortOrder)?
                 | Expression (WS SortOrder)?
SortOrder      ::= "asc" | "desc"
```

- `table { amount: price * qty, order_id desc }` のように列別名とソート順を記述できます。
- `Unpack` をそのまま列リストに埋め込めるため、JSON 展開と組み合わせた投影が可能です。

## フィルタと付随句 (`Filters`)

```ebnf
Filters ::= Filter (WS Filter)*

Filter ::= "[" WS Expression WS "]"
         | "where" WS Expression
         | "select" WS ValueWildCardReferences
         | "group" WS "by" WS ValueReferences WS "select" WS ValueWildCardReferences
         | "{" WS ValueReferences WS "=>" WS ValueWildCardReferences WS "}"
         | JoinClause
         | WindowClause
```

- `table users ( age >= 20 )?` のように記述すると `WHERE` 句になります。
- `group by` の糖衣では `table logs { level, => count(*) }` のようにグループ化と集計を同時に指定できます。
- `WindowClause` で `window w as (partition by ...)` 等のウィンドウ定義を追加できます。

### JOIN の糖衣構文

```ebnf
JoinClause ::= JoinType? WS "join" WS TableReference WS "using" WS "(" NameList ")"
             | JoinType? WS "join" WS TableReference ("on" WS Expression)?
             | "natural" WS "join" WS TableReference
             | JoinType? WS "-:" WS Name (WS ":" WS Name)? WS ":>" WS TableReference

JoinType   ::= "left" | "right" | "full" | "inner" | "cross"
```

- `join ... using (...)` と `join ... on ...` をサポートします。
- `-: key :> table` は `JOIN ... USING (key)` を簡潔に書くための糖衣です。複数キーを指定する場合は `-: key1 : key2 :> table` のように書きます。

## ワイルドカード参照

```ebnf
ValueWildCardReferences ::= ValueWildCardReferenceOrUnpack (WS "," WS ValueWildCardReferenceOrUnpack)*
ValueWildCardReferenceOrUnpack ::= ValueWildCardReference | Unpack

ValueWildCardReference ::= "*"
                         | Name "." "*"
                         | QualifiedName "." "*"
```

- SELECT 投影内で `*`, `table.*`, `schema.table.*` を展開できます。
- `Unpack` と組み合わせることで、通常の列展開と JSON 展開を混在させることができます。

## 実行時の扱い

- これらの規則は `TableBuilder` に変換され、記述順に `select`, `where`, `join`, `group by` などが適用されます。
- 最終的な SQL は `preprocess` を通じて `@variable` 表記などを解決した後、SQLite に送られます。

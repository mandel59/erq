# 式と演算子 (`Expression` 規則)

Erq の式は大きく 3 層に分かれています。

| 規則 | 役割 |
| --- | --- |
| `Expression` | `IN`/`NOT IN` のような右結合演算を扱う最上位層 |
| `Expression1` | 単項・二項演算子の優先順位を管理 |
| `Value` | 関数呼び出し、リテラル、サブクエリなど基本要素 |

以下では EBNF 風の表記で各層を記述します。

## `Expression`

```ebnf
Expression ::= Expression1
             | Expression1 WS InTail

InTail     ::= ("not" WS)? "in" WS (Table | "[" WS RecordOrExpressionList WS "]")
               (WS BinaryOperator WS Expression)?
```

- 右辺にはテーブル式または角括弧によるリストを指定できます。
- `BinaryOperator` を後置すれば、`a in (...) collate nocase` のような連結が可能です。

## `Expression1`

```ebnf
Expression1 ::= UnaryOperator WS Expression1
              | RowValue WS ComparisonOperator WS RowValue
              | Value (WS BinaryOperator WS Expression1)?
              | RowValue
```

- `UnaryOperator` は `+`, `-`, `~`, `not` を含みます。
- `BinaryOperator` は `+`, `-`, `*`, `/`, `%`, `and`, `or`, `->`, `->>`, `collate`, `escape` など。
- `ComparisonOperator` には `=`, `<>`, `<`, `>`, `<=`, `>=`, `is`, `is not`, `==` など行値比較で使用する演算子が含まれます。

## `CaseExpression`

```ebnf
CaseExpression ::= "case" WS WhenClause+ ElseClause? WS "end"
                 | "case" WS ExpressionOrRowValue WS WhenClause+ ElseClause? WS "end"
                 | "if" WS Expression WS "then" WS Expression ElseClause? WS "end"

WhenClause ::= "when" WS ExpressionOrRowValue WS "then" WS Expression
ElseClause ::= "else" WS Expression
```

- `if ... then ... else ... end` は糖衣構文で、内部的には CASE 式へ変換されます。

## `Value`

```ebnf
Value ::= CaseExpression
        | "(" WS Expression WS ")"
        | "from" WS Table
        | "not" WS "exists" WS Table
        | "exists" WS Table
        | Variable
        | Literal
        | "cast" WS "(" WS Expression WS "as" WS TypeName WS ")"
        | Pack
        | FilteredFunctionCall
        | WindowFunctionCall
        | RaiseFunctionCall
        | FunctionCall
        | ModuleQualifiedName ("." Name)? ("(" ExpressionList ")")?
```

- `from Table` はサブクエリを括弧付きで挿入します。
- `Pack` と `RaiseFunctionCall`、`WindowFunctionCall` などは専用の構文で扱います（別ファイル参照）。

## 行値 (`RowValue`)

```ebnf
RowValue ::= "{" WS Expressions WS "}"
           | "^" WS Table
           | "from" WS Table
           | QualifiedName "." BraceColumnNameList
           | ValuesList
```

- `^table` / `^schema.table` はテーブル式と同様に自動相関の対象となり、親クエリに対して等式条件を挿入します。
- `table.column{a, b}` のような記法で複数列をまとめて参照できます。

## リスト系

```ebnf
Expressions              ::= Expression (WS "," WS Expression)*
RecordOrExpressionList   ::= RecordOrExpression (WS "," WS RecordOrExpression)*
RecordOrExpression       ::= Record | Expression
```

- `Expressions` は関数引数や `VALUES` 内の行などで再利用されます。
- `Record` の定義は [`tables/values.md`](../tables/values.md) を参照してください。

## ウィンドウ関数とフィルタ

- `FilteredFunctionCall ::= FilterClause WS FunctionCall`
  例: `[x % 2 = 0] sum(x)` とすると、偶数のみの合計を計算します。

- `WindowFunctionCall ::= FilterClause WS OverClause WS FunctionCall
                         | OverClause WS FilterClause WS FunctionCall
                         | OverClause WS FunctionCall`

  DSL で利用できる並びは次の通りです。
  1. **`FilterClause` → `OverClause` → 関数呼び出し**（例: `[value % 2 = 0] over(partition by value % 3) sum(value)`）
  2. **`OverClause` → `FilterClause` → 関数呼び出し**（例: `over(partition by value % 3) [value % 2 = 0] sum(value)`）
  3. **`OverClause` → 関数呼び出し**（フィルタ無しのウィンドウ関数。例: `over(partition by value % 3) sum(value)`）

- `FilterClause ::= "[" WS Expression WS "]"`
- `OverClause ::= "over" WS (WindowDefn | Name)`  
  `WindowDefn` では `partition by`, `order by`, `range/rows/groups` といったフレーム指定を組み合わせます。具体的な構文は `src/erq.pegjs` を参照してください。

詳細なパラメータは `src/erq.pegjs` を参照しつつ、SQLite のウィンドウ関数構文に準じて理解してください。

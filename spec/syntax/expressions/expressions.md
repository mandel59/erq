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
        | WindowFunctionCall
        | FilteredFunctionCall
        | RaiseFunctionCall
        | FunctionCall
        | ModuleQualifiedName ("." Name)? ("(" ExpressionList ")")?
```

- `from Table` はサブクエリを括弧付きで挿入します。
- `Pack` と `RaiseFunctionCall`、`WindowFunctionCall` などは専用の構文で扱います（別ファイル参照）。

## 行値 (`RowValue`)

```ebnf
RowValue ::= "{" WS Expressions WS "}"
           | "from" WS Table
           | QualifiedName "." BraceColumnNameList
           | ValuesList
```

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

- `FilteredFunctionCall ::= FunctionCall WS "filter" WS "(" WS "where" WS Expression WS ")"`
- `WindowFunctionCall ::= FunctionCall WS "over" WS (WindowDefn | Name)`
- `WindowDefn` では `partition by`, `order by`, `range/rows/groups` といったフレーム指定を組み合わせます。

詳細なパラメータは `src/erq.pegjs` を参照しつつ、SQLite のウィンドウ関数構文に準じて理解してください。

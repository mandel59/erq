# JSON ユーティリティ (`pack` / `unpack`)

Erq には JSON を生成・展開する DSL が用意されており、`pack` と `unpack` の 2 つの構文で構成されています。ここでは EBNF 風の記法で概要を示します。

## `pack`

```ebnf
Pack      ::= "pack" WS PackBody
PackBody  ::= "{" WS PackEntry (WS "," WS PackEntry)* WS "}"
            | "[" WS PackBody (WS "," WS PackBody)* WS "]"
            | Expression
PackEntry ::= JSONObjectKey WS ":" WS PackBody
            | Name                      -- キーと値が同名
            | Expression                -- 任意の式をキー・値に採用
```

- オブジェクト形式では `pack { key: expr, alias }` のようにキーと値を並べます。識別子だけを記述した場合、キーと値が同名になります。
- 配列形式では `pack [ expr1, expr2, ... ]` が `json_array(expr1, expr2, ...)` に対応します。
- 単一の式を渡した場合、JSON 文字列かどうかを自動判定し、適切な SQL 関数（`json`, `json_quote` など）に変換されます。

## `unpack`

```ebnf
Unpack      ::= "unpack" WS UnpackSource WS UnpackBody
UnpackSource ::= "(" WS Expression WS ")"
               | Name ("." Name)*
UnpackBody  ::= "{" WS UnpackObject (WS "," WS UnpackObject)* WS "}"
               | "[" WS UnpackArray (WS "," WS UnpackArray)* WS "]"
               | Name
```

- `UnpackSource` は展開対象の JSON 値を指し、式または `schema.table.column` 形式の参照を指定できます。
- オブジェクト形式は `unpack payload { user: { id, name } }` のようにネストできます。

`unpack` の結果は SELECT の投影列として扱われ、`source->>'$.path'` 形式の式に展開されます。

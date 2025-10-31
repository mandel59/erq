# `values` とレコード構文

Erq は SQLite の `VALUES` 句を拡張し、配列リテラルや疑似 JSON から簡潔にテーブルを構築できるようにしています。以下は EBNF 形式での概要です。

## `ValuesList`

```ebnf
ValuesList ::= "values" WS (ColumnNameList WS)? "[" WS RowItems WS "]"
             | "values" WS ColumnNameList WS "[" WS "]"
             | "values" WS "[" WS QuasiJsonObjectEntries WS "]"

RowItems   ::= RowItem (WS "," WS RowItem)*
RowItem    ::= Record | Expression
```

1. **行配列** – `values ( {1, 'foo'}, {2, 'bar'} )?` のように行を列挙します。各行は自動的に括弧付きのタプルへ変換されます。
2. **空集合** – `values (col1, col2) []` は列名だけを宣言し、空のテーブルを生成します。
3. **疑似 JSON** – `values ( { id: 1, name: 'foo' }, { id: 2 } )?` のようにキー付きレコードを列挙できます。キー集合が列名となり、欠けた値は `null` で埋められます。

## レコードと行値

```ebnf
Record ::= "{" WS Expressions WS "}"

RecordOrExpressionList ::= RecordOrExpression (WS "," WS RecordOrExpression)*
RecordOrExpression     ::= Record | Expression
```

- `Record` は `({expr1}, {expr2}, ...)` の形へ展開されます。
- `RecordOrExpressionList` は `IN` 句などで行値と単一値を混在させるためのヘルパーです。

## 疑似 JSON (`QuasiJsonObjectEntries`)

```ebnf
QuasiJsonObjectEntries ::= QuasiJsonObjectEntry (WS "," WS QuasiJsonObjectEntry)*
QuasiJsonObjectEntry   ::= JSONObjectKey WS ":" WS QuasiJsonExpression
QuasiJsonExpression    ::= QuasiJsonObject
                         | QuasiJsonArray
                         | Expression
```

- `values [ { id: 1, tags: ('a', 'b')? } ]` のように、JSON 風の構文で値を記述すると SQL の `json_object` / `json_array` に変換されます。
- `JSONObjectKey` は文字列リテラルだけでなく識別子も許容し、`pack` と同様にキーを簡潔に書けます。

## 例

```erq
-- 単純な値リスト
table t = values ( {1, 'foo'}, {2, 'bar'} )?;;

-- 疑似 JSON からテーブル化
table logs = values (
  { level: 'info', message: 'start', meta: { pid: 1234 } },
  { level: 'error', message: 'fail', meta: { pid: 1234, code: 500 } }
)?;;

-- 行値を IN 句で利用
from data
  { id, name }
  where (id, name) in ( {1, 'foo'}, {2, 'bar'} )?;;
```

これらの表現は内部で標準 SQL に正規化され、SQLite にそのまま送信できます。

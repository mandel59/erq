# JSON 補助規則

Erq の文法には JSON を直接記述するための補助規則が含まれており、Vega DSL や `pack`/`values` の疑似 JSON、メタコマンドのオプション解析で利用されます。以下に EBNF 形式で代表的な構造をまとめます。

## 基本構造

```ebnf
JSONValue   ::= JSONObject | JSONArray | JSONString | JSONNumber | JSONBoolean | JSONNull
JSONObject  ::= "{" WS JSONObjectEntry (WS "," WS JSONObjectEntry)* WS "}"
JSONArray   ::= "[" WS JSONValue (WS "," WS JSONValue)* WS "]"
JSONObjectEntry ::= JSONObjectKey WS ":" WS JSONValue
JSONObjectKey   ::= JSONString | Name
```

- `JSONObject` と `JSONArray` は再帰的に定義され、戻り値は JavaScript の値として扱われます。
- キーには文字列リテラルだけでなく識別子（`Name`）も使用できます。

## 疑似 JSON（SQL 変換用）

```ebnf
QuasiJsonExpression ::= QuasiJsonObject
                      | QuasiJsonArray
                      | Expression

QuasiJsonObject ::= "{" WS QuasiJsonObjectEntry (WS "," WS QuasiJsonObjectEntry)* WS "}"
QuasiJsonObjectEntry ::= JSONObjectKey WS ":" WS QuasiJsonExpression

QuasiJsonArray ::= "[" WS QuasiJsonExpression (WS "," WS QuasiJsonExpression)* WS "]"
```

- `values [ { id: 1, total: price * qty } ]` のように、式を含む JSON 風の表記を SQL に変換するために使用します。
- 生成結果は `json_object` / `json_array` へ展開されます。

## Vega DSL と JSON

- `VegaViewJsonOption ::= "options" WS JSONObject` といった規則で、生の JSON オプションを追加します。
- チャネルやエンコーディングのオプション（`VegaFieldOptions`, `VegaChannelOptions`）も `JSONObject` を受け取る設計です。

## メタコマンドとの連携

- `LoadOption`（`load table`）や `NdjsonOptions`（`set format`）では、`JSONString` や `JSONNumber` をそのまま設定値として使用します。
- Raw ブロック (` ``` ... ``` `) と組み合わせることで、外部ファイルを介さずに JSON データを組み込めます。

## 注意点

- JSON 関連の規則は構文解析のみを担当し、フィールドの存在や型チェックは実行時に行われます。
- `unpack` で展開する際には、`JSONObjectKey` が返すキーが JSON パス（`$` から始まる）にそのまま反映されるため、特殊文字を含むキーは適切にクォートしてください。

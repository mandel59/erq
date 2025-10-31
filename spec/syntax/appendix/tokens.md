# トークンとキーワード

Erq の文法では、PEG レベルで共通的に使用するトークン規則とキーワード集合を定義しています。ここでは `space`/`_`/`boundary` などのユーティリティ規則と、`keywords.js` に由来する予約語集合を整理します。

## 空白・コメント

| 規則 | 定義 | 役割 |
| --- | --- | --- |
| `space` | `[ \f\n\r\t\v…]` + コメント（`--`、`/* */`） | 生の空白・コメント 1 文字を消費 |
| `_` | `(comment / space+)*` | 空白・コメントを必要に応じてスキップ |
| `__` | `boundary _` | ワード境界を確認した上で空白をスキップ |

- ほとんどの規則で `_` を前置し、空白を透過的に扱います。
- `boundary` は `/\b/` を利用して単語境界を検査し、キーワードと識別子の区切りを保証します。

## 予約語集合

`src/keywords.js` で以下 2 種類の集合が公開されています。

- `keywords` – SQLite の予約語一覧。すべて小文字に正規化され、`Identifier` を識別子として許容するかどうかの判定に利用されます。
- `erqKeywords` – Erq 独自の DSL で頻出するキーワード（`apply`, `pack`, `parallel`, `vega` など）。補完機能や構文上の期待値に使用されます。

両集合は PEG の文法チェックそのものでは参照されませんが、`parser-utils.isIdentifier` が `keywords` を参照しており、SQL の予約語と衝突する名前を自動的にバッククォートでエスケープします。

## 数値・文字列トークン

- `NumericLiteral` – 下線 (`_`) を含む 10 進・16 進数／小数／指数表記をサポート。戻り値は桁区切りを除去した文字列です。
- `ParsedStringLiteral` – `ParsedStringLiteral` は `load table` などでファイルパスを扱うときに使用され、クォートを除いた生文字列を返します。
- `EscapedString` – `E'...'` 形式。`\n`, `\t`, `\u{1F600}` や `%(format)` といった拡張を `format` 関数向けトークンへ分解します。

詳細は [`expressions/literals-identifiers.md`](../expressions/literals-identifiers.md) を参照してください。

## JSON トークン

- `JSONValue`, `JSONObject`, `JSONArray`, `JSONString`, `JSONNumber` などが Raw ブロックや `values` の疑似 JSON 構文で使用されます。
- 戻り値は JavaScript の値に変換されるため、`meta-load` のオプション解析などでそのまま利用できます。

## Raw ブロック

````text
```tag
...content...
```
````

`RawBlock` はバックスラッシュではなくバッククォートで囲み、タグ（`csv`, `js`, `vega` など）を任意に付与できます。戻り値は `{ rawblock: (tag, content)? }` 形式で、メタステートメントや`create function`の本体に渡されます。詳細は [`raw-blocks.md`](./raw-blocks.md) を参照してください。

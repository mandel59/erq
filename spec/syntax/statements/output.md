# 出力フォーマット指定 (`set format` / `output` 句)

Erq では、メタステートメント `set format ...;;` や各ステートメントの `output ...` 句を通じて出力フォーマットを制御します。本節では `FormatClause`, `DestinationClause`, `Vega` などの構文を整理します。動作仕様については `spec/metacommand/internal/meta-set-output.md` および `spec/metacommand/README.md` を参照してください。

## `FormatClause`

```ebnf
FormatClause ::= ("format" WS)?
                 ( "dense"
                 | "array"
                 | "sparse" (WS NdjsonOptions)?
                 | "object" (WS NdjsonOptions)?
                 | "ndjson" (WS NdjsonOptions)?
                 | "jsonl" (WS NdjsonOptions)?
                 | "raw"
                 | "csv" (WS CsvOptions)?
                 | VegaClause )
```

- `format` キーワードは任意で、`set format dense` と `output format dense` の両方に対応します。
- `dense`/`array` は配列出力、`sparse`/`object`/`ndjson`/`jsonl` はオブジェクト出力です。
- `csv` を選ぶと、`CsvOptions` で区切りやエンコーディングなどを細かく調整できます。
- `VegaClause` を指定すると Vega/Vega-Lite による可視化を生成します。

## `NdjsonOptions`

```ebnf
NdjsonOptions ::= "with" WS NdjsonOption (WS "," WS NdjsonOption)*
NdjsonOption  ::= "omit" WS "null"
                | "include" WS "null"
                | ("indent" | "space") (WS NumberLiteral)?
                | "no" WS ("indent" | "space")
                | "raw" WS "json" (WS ColumnNameList)?
```

- `omit null` と `include null` で `null` の扱いを切り替えます。
- `indent`/`space` は JSON のインデント幅（整数）を指定し、`no indent` でフラットな出力に。
- `raw json` は文字列として得られた列を JSON として再解釈します。列リストを付けると対象列を限定できます。

## `CsvOptions`

```ebnf
CsvOptions ::= "with" WS CsvOption (WS "," WS CsvOption)*
CsvOption  ::= "header"
             | "no" WS "header"
             | "delimiter" WS StringLiteral
             | "row" WS "delimiter" WS StringLiteral
             | "null" WS StringLiteral
             | "quote" WS StringLiteral
             | "no" WS "quote"
             | "escape" WS StringLiteral
             | "encoding" WS StringLiteral
```

- ヘッダーの有無、列区切り・行区切り、`null` の置換文字列などを設定できます。
- `encoding` は出力ファイルを指定の文字コードに再エンコードします。

## `DestinationClause`

```ebnf
DestinationClause ::= "to" WS Destination
Destination       ::= "stdout"
                    | "stderr"
                    | ("file" WS)? (StringLiteral | EscapedString | Variable)
                    | ("url" | "uri") WS StringLiteral
```

- `stdout` / `stderr` で標準出力・標準エラーを選択。
- `file` ではパスを文字列リテラル、エスケープ文字列、変数のいずれかで指定できます。エスケープ文字列は SQL 式からパスを取得する用途です。
- `url` / `uri` は S3 や HTTP といったリモート書き込みに対応します。

## `FormattingClause`

```ebnf
FormattingClause ::= "output" WS
                     ( DestinationClause (WS FormatClause)?
                     | FormatClause (WS DestinationClause)? )
```

- `output to file 'out.csv' format csv ...` と `output format csv ... to file ...` の両順序を許容します。
- 指定されたフォーマットおよび出力先は、そのステートメントの実行結果に適用されます。

## Vega/Vega-Lite 指定 (`VegaClause`)

```ebnf
VegaClause ::= "vega" ("lite")? VegaFormat? ("with" WS VegaView)?
VegaFormat ::= "spec" | "svg" | "png" | "inline" ("image")?
```

- `vega spec` は Vega-Lite をコンパイルした Vega 仕様（JSON）を出力します。
- `vega svg` や `vega png` は描画結果をベクタ／ビットマップとして出力します。
- `inline image` は iTerm2 などの inline イメージコントロールシーケンスを生成します。

### `VegaView`

`VegaView` では Vega/Vega-Lite の主要構成要素を DSL として組み合わせます。

| 構成要素 | EBNF 概要 |
| --- | --- |
| `VegaMark` | `mark` 名称 (`{` プロパティ `}`)? |
| `VegaEncoding` | `encoding {` チャネル定義 `}`（`x`, `y`, `color` など） |
| `VegaTransform` | `transform` 句で `filter`, `calculate`, `aggregate` 等を指定 |
| `VegaProjection` | `projection` 名称 (`{` パラメータ `}`)? |
| `VegaCompose` | `layer(...)`, `concat(...)`, `hconcat(...)`, `vconcat(...)` |
| `VegaFacet` | `facet columns N { ... } (...)` など、ファセットビューの宣言 |
| `VegaRepeat` | `repeat (row(...) column(...)) (...)` 等で繰り返し定義 |
| `VegaResolve` | `resolve scale x shared` といった独立・共有設定 |
| `VegaViewJsonOption` | `options { ... }` で生の JSON オプションを追加 |

各要素は JSON オブジェクトの形に展開され、最終的な Vega-Lite/Vega 仕様を組み立てます。詳細なプロパティは Vega-Lite の公式ドキュメントと併読してください。

## 使用例

```erq
-- デフォルトフォーマットを NDJSON に設定
set format ndjson with raw json;;          -- meta-set-output 呼び出し

-- クエリ単位で CSV 出力 + ファイル指定
from data
  output format csv with header, delimiter ',' to file 'out.csv'
  { * };;

-- Vega-Lite で棒グラフを描画
from sales
  output vega lite svg with
    mark bar
    encoding {
      x: field(product) quantitative
      y: aggregate(sum) field(amount)
    };;
```

# 内部メタコマンド `meta-set-output`

`meta-set-output` は `set format ...;;` ステートメントから呼び出される内部メタコマンドです。ユーザーは `.meta-set-output` のようなドットメタコマンドを実行できず、構文木が `runCLICommandThrowing` に渡される過程で内部的に解決されます。  
クエリ内の `output format ...` 句はステートメント固有のフォーマット指定として評価され、`meta-set-output` は介在しません。

## 呼び出し元
- `set format ...;;`

## 主な役割
- グローバル状態 `outputFormat` を更新し、以降の結果セット整形に用いるフォーマット種別（`dense`, `sparse`, `csv`, `raw`, `vega` など）とオプションを保持する。
- NDJSON のインデントや `omit null`, CSV の区切り文字やエンコーディング、Vega/Vega-Lite の DSL など、フォーマット固有の設定を `formatOptions` に格納する。
- `output to ...` で明示されない限り、更新後のフォーマットが後続の `select`・`pragma` ステートメントに適用される。

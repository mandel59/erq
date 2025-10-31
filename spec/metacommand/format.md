# .format メタコマンド

## 概要
`.format` は CLI で実行するドットメタコマンドで、対話セッション全体の既定出力フォーマットを配列（dense）またはオブジェクト（sparse）に切り替えます。`.format` で設定した値は `set format ...;;` メタステートメントやクエリ単位の `output format ...` 句で上書きするまで持続します。

## 構文
```text
.format MODE
```

- `MODE`: `array` もしくは `object` のいずれか。

## 挙動
- `array` を指定すると内部状態 `outputFormat` が `{ format: "dense" }` に更新され、各レコードが JSON 配列として 1 行ずつ（NDJSON）出力されます。
- `object` を指定すると `outputFormat` が `{ format: "sparse" }` になり、列名をキーとした JSON オブジェクトの NDJSON が出力されます。キーごとに `null` を含む値も出力されます（細かな整形は `set format` のオプションを使用してください）。
- 上記以外の値や引数数が不正な場合は以下の使用方法が表示され、設定は変更されません。
  ```text
  usage: .format MODE
    MODE is one of:
      array  Results in ndjson (each record is an JSON array)
      object Results in ndjson (each record is an JSON object)
  ```
- 成功時は以降のクエリで明示的な `output format` 指定がない限り、この設定が利用されます。

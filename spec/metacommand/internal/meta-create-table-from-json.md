# 内部メタコマンド `meta-create-table-from-json`

`meta-create-table-from-json` は `create table ... from json (...);;` 構文を処理するための内部メタコマンドです。ユーザーが `.meta-create-table-from-json` を直接実行することはできず、ステートメントがパーサーで `type: "command"` に変換された際に内部的に呼び出されます。

## 呼び出し元
- `create table [if not exists] <name> [(...)] from json (<table expr>);;`

## 主な役割
- JSON 文字列を解析し、列名が明示されていない場合は `json_each` を利用してキー集合から列レイアウトを推測する。
- 推測または指定された列定義を用いて `create table` を実行し、配列は行へ展開しながら `insert into` でレコードを投入する。
- 挿入件数や経過時間を標準エラーに出力し、エラー時はトランザクションをロールバックする。

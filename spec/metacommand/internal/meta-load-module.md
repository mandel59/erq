# 内部メタコマンド `meta-load-module`

`meta-load-module` は `load module <path> [as <alias>];;` ステートメントに対応する内部メタコマンドです。対話プロンプトで `.meta-load-module` を実行することはできず、構文解析結果が `runCLICommandThrowing` に渡されたときのみ呼び出されます。

## 呼び出し元
- `load module ...;;`

## 主な役割
- `modulePathNameToName` でモジュール名を正規化し、`modules` マップから動的インポートを行う。
- `modulePrefix`（別名がある場合は `<alias>::`）を決定し、モジュールの `load` フックへ `defineFunction`/`defineTable`/`defineAggregate`/`registerModule` などの API を提供する。
- ロード済みモジュール一覧は CLI 補完などから参照され、以降のクエリで `alias::function_name(...)` の形で利用できる。

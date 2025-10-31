# 内部メタコマンド `meta-create-function`

`meta-create-function` は `create function ...;;` および `create table function ...;;` ステートメントに対応する内部メタコマンドです。`.meta-create-function` というドットメタコマンドは存在せず、構文解析されたステートメントが `runCLICommandThrowing` に渡された際に内部的に起動されます。

## 呼び出し元
- `create function <name>(...) [returns ...] [language js] as <code>;;`
- `create table function <name>(...) [returns (...)] [language js] as <code>;;`

## 主な役割
- QuickJS ベースの JavaScript ランタイム (`src/js-runtime.js`) にコードを登録し、SQLite から呼び出すための関数／テーブル関数ラッパーを作成する。
- `returns` 句がある場合は戻り列レイアウトを保持し、テーブル関数の `columns` 定義に渡す。
- 同じ関数名が既に存在する場合は上書きし、JavaScript 例外が発生した際は `JSRuntimeError` として扱う。

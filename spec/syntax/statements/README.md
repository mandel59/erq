# ステートメント層の概要

`Statement` 規則は Erq の最上位文を表し、以下の 3 系統に分類されます。

| 系統 | 規則 | 説明 |
| --- | --- | --- |
| 制御構文 | `IfStatement`, `ForStatement`, `WhileStatement`, `BlockStatement` | Erq 独自の制御フロー。SQL 文の繰り返し・分岐をサポートします。 |
| メタステートメント | `MetaStatement` | `load table`, `set format` など、内部メタコマンドに変換される文。 |
| SQL ラッパー | `Statement1` 以下 | `create`, `select`, `pragma` など、SQLite ステートメントの構文糖。 |

このディレクトリでは、主要なグループごとに仕様をまとめています。

- [`control-flow.md`](./control-flow.md) – `if` / `for` / `while` / `parallel` などの制御ブロック。
- [`meta-statements.md`](./meta-statements.md) – メタコマンドに変換される構文と内部コマンドの対応。
- [`output.md`](./output.md) – `set format` や `output` 句、Vega / CSV オプション。
- [`table-constructs.md`](./table-constructs.md) – `Table` 規則とテーブル式の組み立て。
- [`script-integration.md`](./script-integration.md) – `Statement1` 配下の SQLite ラッパーとブロック構文の関わり。

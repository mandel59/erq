# Erq 文法仕様概要

本ディレクトリでは、Erq の文法（`src/erq.pegjs`）を EBNF 風の表記で整理し、人が読みやすい仕様としてまとめています。  
実際の PEG 実装は抽象化し、構文全体の形を理解できるように層別化しています。

- **CLI エントリポイント** – `start`/`cli_readline`/`script`/`CLICommand` など、REPL やスクリプトの先頭に関わる規則（[`cli.md`](./cli.md)）。
- **ステートメント層** – `Statement` 系規則と、その下位にある制御構文やメタステートメントなど（[`statements/`](./statements)）。
- **式層** – `Expression`、`Value`、`Literal` 等の式を構成する構文（[`expressions/`](./expressions)）。
- **テーブル式** – `Table` や `WithClause`、`Values` 等、FROM 句周りの構文（[`tables/`](./tables)）。
- **付録** – トークン、Raw ブロック、JSON 系補助規則など（[`appendix/`](./appendix)）。

各ファイルには以下を記載しています。

1. 規則名（`erq.pegjs` 内の対応箇所がわかる見出し）。
2. 構文の自然言語説明と例。
3. 実装上の補足や関連仕様へのリンク（メタコマンド等）。

メタコマンドの動作仕様は `spec/metacommand` にまとめています。本ディレクトリでは、それらに対応する構文の書き方に焦点を当てます。

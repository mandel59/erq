# Erq アーキテクチャ概要

## 全体像
- エントリポイント `bin/erq-cli.js` が CLI を起動し、対話モードでは入出力制御を担う親プロセス (`src/parent.js`) と、クエリ評価を担当する子プロセス (`src/child.js`) を分岐する。
- 子プロセスは `better-sqlite3` を用いて SQLite に接続し、Erq の文を SQL へ前処理したうえで実行する。結果のフォーマットや外部リソース取り込みも同プロセスで処理する。
- 言語フロントエンドは Peggy で記述された文法 `src/erq.pegjs` をコンパイルしたパーサー (`dist/erq.js`) を利用し、`src/parser.js` がデバッグ版の生成やロードを制御する。
- 拡張機構として Node.js/QuickJS ベースのモジュールとユーザー定義関数を提供し、`.load module` や `create function` メタコマンドから動的に登録できる。

## CLI とプロセスモデル
- `src/options.js` が `command-line-args` を通じて CLI オプションを解析し、ヘルプやバージョン表示もここで実装されている。
- 親プロセス (`src/parent.js`) は `readline` を用いたプロンプト、履歴読み書き (`src/history.js`)、補完 (`src/completer.js`) への委譲、シグナル処理を担い、子プロセスとは IPC でやり取りする。
- `src/erq-client.js` は親子プロセス間通信の抽象化レイヤーで、`runSqls`, `runCLICommand`, `runScript` などのメソッドを通じて子プロセスへリクエストを送る。
- バッチ実行時は親プロセスが標準入力を一括読み取り、`;` 区切りで構文解析したステートメント群を子プロセスに送って順次実行する。

## 子プロセスの実行パイプライン
- `src/child.js` が初期化処理としてグローバル変数の展開、データベース接続、標準モジュール (`src/modules/global.js` など) のロードを行う。
- ステートメントは `runSqlsWithEnv` で走査され、`type: "command"` のものはメタコマンド実装へ、通常ステートメントは `preprocess` (`src/eval-utils.js`) で変数・テーブル名を解決したうえで SQLite に渡される。
- `runCLICommandThrowing` ではドットメタコマンドに加え、`load table` や `set format` などの構文から呼び出される内部メタコマンド (`meta-load`, `meta-set-output`, `meta-create-function`, `meta-create-table-from-json` など) を処理する。
- 出力制御は `outputFormat` と `defaultDestination` の状態で管理し、`evalDestination` (`src/eval-utils.js`) が標準出力/ファイル/URL への書き込みストリームを抽象化する。CSV や NDJSON の整形は `src/csv-utils.js` などのユーティリティが支援する。
- 並列実行 (`parallel` ステートメント) では `src/erq-client.js` を用いて複数の子プロセスをスポーンし、ロード済み SQL と変数を配布して実行する。

## 言語フロントエンド
- 文法定義 `src/erq.pegjs` は CLI ステートメント・メタコマンド・制御構文 (`if`/`for`/`while` など) を含む完全な言語仕様を記述する。Raw ブロックや Vega DSL など複合的な構文もここで扱う。
- `src/parser-utils.js` は識別子のクォート処理、Vega フィールドのエスケープ、テーブルビルダーなど、文法アクションから利用するユーティリティを提供する。
- `src/parser.js` はデバッグ用に Peggy ソースを再コンパイルする機能 (`ERQ_DEBUG_PARSER` 環境変数) を持ち、標準時はプリビルドされた `dist/erq.js` をロードする。

## モジュールと拡張
- `src/create-erq-nodejs-module.js` が Node.js モジュールを Erq モジュールとして読み込むための共通ユーティリティを定義し、`context.defineTable` などの API を公開する。
- 標準モジュールは `src/modules` ディレクトリで管理され、`global.js` がデフォルト機能を登録するほか、`iconv.js`, `geo.js`, `opendal.js`, `dom.js` などが追加リソースを提供する。
- JavaScript ベースのユーザー定義関数は QuickJS (`quickjs-emscripten`) を利用する `src/js-runtime.js` で実装され、`create function`/`create table function` によって動的に追加・削除できる。

## 対話支援とユーティリティ
- `src/completer.js` は現在のデータベーススキーマやモジュールを探索し、SQL/Erq のキーワードやテーブル・関数名を補完候補として提示する。
- `src/async-iter.js` は非同期イテレータを扱う補助関数、`src/io.js` は TTY 判定などの環境情報を提供する。
- ユーザー履歴は `~/.erq_history`（既定）に保存され、環境変数 `ERQ_HISTORY_SIZE` で履歴長を調整できる。

## 周辺ディレクトリ
- `doc/` にはクイックスタートや SQL 比較などのユーザー向けドキュメントが収録されている。
- `examples/` はサンプル `.erq` ファイルを提供し、`tests/` は `.erq` スクリプトを実行する統合テストセットを含む。
- `erq-ci/` は CI 用のテストランナーや補助スクリプトをまとめており、`scripts/` にはビルド・配布関連の補助コマンドが配置されている。

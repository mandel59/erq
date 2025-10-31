# 課題: テストケースの充実

テストケースでカバーしていない文法や機能があるので、テストを追加したい。

## 実施項目

- [x] どのようなテストが足りていないのか調査する
- [x] テストを追加
- [ ] 発見された不具合の修正
- [x] 実施詳細の更新

## 実施結果

- 制御構文（`if` / `for` / `for each` / `parallel`）と出力指定（`set format` / `output to`）に関するテストが存在しないことを確認。
- `tests/testcases/basic/control-flow.erq` を追加し、条件分岐と各種ループ構文の AST を検証できるフィクスチャを作成。
- `tests/testcases/basic/output-options.erq` を追加し、`set format` メタコマンドと `output` 句のフォーマット／出力先オプションを網羅。
- 追加テストの期待値 JSON を生成し、`npm run test:unit` で全テストが成功することを確認。
- 本タスク中に修正が必要な不具合は再現しなかった。

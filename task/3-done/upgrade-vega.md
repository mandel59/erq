# 課題: vegaのアップグレード

vega, vega-lite を最新版にアップグレードする。

- vega 6.0.0
- vega-lite 6.4.1

テストを実行し、動作確認を行う。

問題があれば、原因を特定して修正する。

## 作業結果

- テスト erq-ci/testcases/vega/game-sales-transform-aggregate.erq の実行結果に差異
  - 出力画像のサイズに変更あり
  - テストを更新して対応

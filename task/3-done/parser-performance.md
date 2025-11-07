# 課題: パースに時間がかかるクエリがある

次のクエリはErqの文法上正しいクエリである。

```
foo{^bar{^baz{^quux{x}}}};;
```

しかし、次のように行を分割してクエリを与えると、パースに時間がかかりすぎて、応答が返ってこなくなる。

```
erq> foo
...> {^bar
...> {^baz
...> {^quux
```

## テスト

tests/performance/ 以下に問題になりうるクエリのテストを作成する。

## 対応内容

- `src/parser.js` にパース結果のメモ化を追加し、同一クエリを繰り返し解析するケースで2回目以降を高速化。
- 新たに `tests/performance/correlate-nested.erq`/`.parsed.json` を追加し、問題の多段相関クエリを性能回帰テストとして固定。
- `tests/test-performance.js` と `tests/test.js` を `src/parser.js` 経由のパーサー利用に切り替えてキャッシュ経路を通すよう調整。
- `peggy` コマンドに `--cache` オプションを指定し、PEGパーサーのキャッシュも有効化する。

## 実施したテスト

- `npm run test:unit`


# Expression 層の概要

`Expression` 規則は Erq の式評価を担い、SQL の演算子に加えて `pack` や QuickJS 連携関数などの拡張を含みます。このディレクトリでは主に以下の観点で整理しています。

- [`expressions.md`](./expressions.md) – `Expression`／`Value`／演算子の結合規則。
- [`pack-unpack.md`](./pack-unpack.md) – `pack`／`unpack`／行値の扱い。
- [`literals-identifiers.md`](./literals-identifiers.md) – リテラル、識別子、型名など基礎トークン。

PEG では 1400 行付近から式の定義が始まり、`Value` → `Expression1` → `Expression` の順で優先順位が決まっています。  
各節では必要に応じて `parser-utils.js` の補助関数（`quote`, `unquoteSQLName` など）にも触れます。

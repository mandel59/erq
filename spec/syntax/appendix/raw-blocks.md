# Raw ブロック

Raw ブロックは、バッククォートで囲まれた複数行の文字列をタグ付きで記述するための構文です。`create function` の JavaScript 本体や `load table` のインラインデータなど、エスケープを気にせずにそのまま埋め込みたい場面で利用します。

## 書式

- 開始デリミタは 2 つ以上のバッククォート。` ``` ` や `` ```` ```` など任意の長さを指定できます。
- 開始行はオプションでタグを付与できます（例: ` ```csv`、` ```js`）。
- コンテンツは終了デリミタと同じ長さのバッククォートが現れるまでそのまま読み取られ、改行も保持されます。
- 終了デリミタは開始デリミタと同じ長さでなければなりません。

擬似的な EBNF で表すと以下の通りです。

```ebnf
RawBlock    ::= Delimiter Tag? Newline RawContent Delimiter
Delimiter   ::= "`" { "`" }                 -- 2 個以上を推奨
Tag         ::= Identifier
RawContent  ::= (任意の行で、同じ長さの Delimiter が出るまで繰り返す)
Newline     ::= "\n" | "\r\n"
```

## 使用例

```erq
-- load table で CSV データを直接記述
load table data from ```csv
id,name
1,Alice
2,Bob
```;;

-- create function で JavaScript を埋め込む
create function greet(name) as ```js
return `Hello, ${name}!`;
```;;
```

タグはメタコマンド側で MIME タイプや言語のヒントとして解釈されます。

## 注意点

- Raw ブロック内部ではエスケープが行われないため、`;;` や `'`、`@var` などをそのまま書いても影響しません。
- 終了デリミタと同じ連続バッククォートを本文中で使う場合は、スペースなどを挟んで回避してください。
- 解析結果は `{ tag, content }` のタプルとして扱われ、後続の処理で適宜解釈されます。

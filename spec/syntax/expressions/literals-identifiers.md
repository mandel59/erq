# リテラルと識別子

Erq は SQLite と互換性のあるトークンルールを採用しつつ、Unicode 識別子や JSON リテラルに対応するための拡張を提供しています。本節では代表的な規則を EBNF 風にまとめます。

## 識別子 (`Name`, `Identifier`)

```ebnf
Name        ::= QuotedName | Identifier
QuotedName  ::= "`" QuotedChar* "`"
QuotedChar  ::= "``" | (任意の文字で改行と NUL を除く)
Identifier  ::= IdentifierStart IdentifierPart*
IdentifierStart ::= "_" | ASCIIAlphabet | UnicodeLetter
IdentifierPart  ::= IdentifierStart | ASCII_Digit | UnicodeDigit
```

- バッククォートで囲むと任意の文字を含められます。内部の `` ` `` は ` `` ` と二重に記述します。
- クォートなしの識別子は SQLite の予約語と衝突する場合、自動的にバックスラッシュで逃がされます。

## 型名 (`TypeName`, `RowType`)

```ebnf
TypeName ::= Identifier (WS Identifier)* ( "(" SignedNumber (WS "," WS SignedNumber)? ")" )?
RowType  ::= "(" WS RowTypeField (WS "," WS RowTypeField)* WS ")"
RowTypeField ::= Name (WS TypeName)?
SignedNumber ::= ("+" | "-")? NumericLiteral
```

- `TypeName` は複合語やサイズ指定をサポートします（例: `double precision`, `varchar(255)`）。
- テーブル関数の戻り値などで `returns (col1 integer, col2 text)` のように `RowType` を記述できます。

## 数値リテラル

```ebnf
NumericLiteral ::= HexLiteral | DecimalLiteral | FractionLiteral
HexLiteral     ::= "0x" HexDigit (HexSeparator HexDigit)*
DecimalLiteral ::= Digit (DigitSeparator Digit)* FractionPart? ExponentPart?
FractionLiteral ::= "." Digit+ ExponentPart?
```

- 桁区切りとして `_` を使用できます（`1_000_000`）。
- 指数表記 (`1.23e+4`) や 16 進表記 (`0xFF`) をサポートします。

## 文字列リテラル

```ebnf
StringLiteral        ::= SQLStringLiteral | EscapedString | JSONString
SQLStringLiteral     ::= "'" ( "''" | 非終端文字 )* "'"
EscapedString        ::= "E'" EscapedSegment* "'"
EscapedSegment       ::= バックスラッシュエスケープ | フォーマット指定 | 通常文字
```

- `SQLStringLiteral` はシングルクォートを二重にする SQLite 標準の書式です。
- `EscapedString`（`E'...'`）では `\n`, `\t`, `\u{1F600}`, `\%s(expr)` などのエスケープを扱えます。
- `JSONString` をそのまま書くと、内部で文字列に変換して SQL に挿入します。

`ParsedStringLiteral`（メタコマンドで利用）など、特殊用途のリテラルについては該当文脈で説明しています。

## BLOB リテラル

```ebnf
BlobLiteral ::= "X'" HexDigit HexDigit (HexSeparator HexDigit HexDigit)* "'"
```

- 偶数桁の 16 進数だけを許容し、結果は大文字へ正規化されます。

## ブール値と `NULL`

- `true` は `1`、`false` は `0` に変換されます。
- `null` は SQLite の `NULL` として扱われます。

## JSON 関連トークン

- `JSONString`, `JSONObject`, `JSONArray` などの規則は [`appendix/json-options.md`](../appendix/json-options.md) で解説しています。
- これらは Raw ブロックや `pack`/`values` の疑似 JSON 構文で利用されます。

## Raw ブロック

Raw ブロックの書式は [`appendix/raw-blocks.md`](../appendix/raw-blocks.md) を参照してください。`create function` の本体や `load table` のインラインデータなど、エスケープせずに複数行を記述したい場面で使用します。

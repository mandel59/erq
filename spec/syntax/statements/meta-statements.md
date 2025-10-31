# メタステートメント構文

`MetaStatement` 規則は、Erq 独自の構文を内部メタコマンド (`meta-*`) に変換します。  
実際の動作仕様は `spec/metacommand` および `spec/metacommand/internal` を参照し、本節では構文と引数の構造を解説します。

## 一覧

| 構文 | 内部メタコマンド | 規則 |
| --- | --- | --- |
| `load table ... from ...` | `meta-load` | `LoadRawBlock` |
| `load module ... [as ...]` | `meta-load-module` | `LoadModule` |
| `create [table] function ... as ...` | `meta-create-function` | `CreateFunction` |
| `create table ... from json (...)` | `meta-create-table-from-json` | `CreateTableFromJson` |
| `set format ...` | `meta-set-output` | `SetOutputFormat` |

## `load table` (`LoadRawBlock`)

```ebnf
LoadTableStmt ::= ("do" WS)? "load" WS "table" WS
                  ("if" WS "not" WS "exists" WS)?
                  TableTarget
                  ("(" ColumnDefinitionList ")")?
                  WS "from" WS LoadSource
                  (WS LoadOption (WS "," WS LoadOption)*)?
```

- `TableTarget` は通常の表名に加えて `@変数` を許容します。
- `ColumnDefinitionList` を指定すると、列名・型・制約を明示的に与えられます。
- `LoadSource` には以下を指定できます。
  - Raw ブロック（例: ```csv``, ```ndjson``）。
  - 文字列リテラルまたはエスケープ文字列。
  - 変数参照 `@path`。
  - `url 's3://bucket/key'` などの URL。
- `LoadOption` は `header`, `format csv`, `encoding 'utf-8'`, `relax column count more` 等の修飾子です。詳細な挙動は内部仕様書を参照してください。

## `load module` (`LoadModule`)

```ebnf
LoadModuleStmt ::= ("do" WS)? "load" WS "module" WS ModulePath
                   ("as" WS Alias)?
ModulePath ::= Identifier ("::" Identifier)*
```

- `ModulePath` はネームスペースを `::` で区切った識別子列です。
- `as` で別名を指定すると、モジュールが公開するシンボルに `<別名>::` プレフィックスを付与して登録します。

## `create [table] function` (`CreateFunction`)

```ebnf
CreateFunctionStmt ::= ("do" WS)? "create" WS ("table" WS)? "function" WS Name
                       WS "(" FunctionParameterList ")"
                       (WS FunctionOption (WS "," WS FunctionOption)*)?
                       WS "as" WS (RawBlock | StringLiteral)
FunctionOption ::= "language" WS Name
                 | "returns" WS (TypeName | RowType)
```

- `table function` を選ぶと、複数行を返すテーブル値関数になります。省略時はスカラ関数。
- `FunctionParameterList` では引数名と型注釈（任意）を列挙します。
- 本体は Raw ブロックまたは文字列リテラルとして記述します。

## `create table ... from json` (`CreateTableFromJson`)

```ebnf
CreateTableFromJsonStmt ::= ("do" WS)? "create" WS "table" WS
                            ("if" WS "not" WS "exists" WS)?
                            TableTarget
                            ("(" ColumnDefinitionList ")")?
                            WS "from" WS "json" WS "(" Table ")"
```

- 括弧内の `Table` 式は JSON テキストを 1 列として返す必要があります。
- 列定義を省略した場合は、JSON のキー集合から列名を推測します。

## `set format` (`SetOutputFormat`)

```ebnf
SetFormatStmt ::= "set" WS "format" WS FormatClause
```

- `FormatClause` は `dense`, `sparse`, `csv`, `raw`, `vega ...` などを指定します（詳細は [`output.md`](./output.md)）。
- `set format` はセッション全体の既定出力フォーマットを更新します。個別クエリでの `output format` は別規則で扱われます。

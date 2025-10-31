# 制御構文 (`If` / `For` / `While` / `Block`)

Erq には SQL の枠を超えて繰り返しや条件分岐を扱うための制御構文が用意されています。本節では、実装依存の細部を除いた EBNF 風の書式で挙動を示します。

## `IfStatement`

```ebnf
IfStatement ::= "if" WS "(" WS Expression WS ")" WS
                ("then" WS)? BlockStatement
                ("else" WS BlockStatement)?
```

- 条件式には一般の `Expression` を利用します。
- `then` は任意。省略時も直後のブロックが実行されます。
- `else` 句は省略可能で、存在する場合は別ブロックを評価します。

## `WhileStatement`

```ebnf
WhileStatement ::= "while" WS "(" WS Expression WS ")" WS BlockStatement
```

- 条件が真の間、`BlockStatement` の内容を繰り返します。
- 条件は各反復の前に再評価されます。

## `ForStatement`

```ebnf
ForStatement ::= "for" WS ForVarAssignments WS "of" WS Table WS BlockStatement
```

- `Table` 式で得られる行を順次処理し、`ForVarAssignments` に従って `@変数` へ値を束縛します。
- 各行に対して `BlockStatement` が実行されます。

### `ForVarAssignments` / `ForVarAssignment`

```ebnf
ForVarAssignments ::= ForVarAssignment (WS "," WS ForVarAssignment)*
ForVarAssignment ::= Variable ("=" WS Expression)?
```

- `@変数 = 式` の形式で初期値を与えられます。省略時は列名をそのまま束縛します。

## `BlockStatement` と `do (...)`

```ebnf
BlockStatement ::= ("do" WS)? "(" WS StatementList WS ")" 
                 | Statement
StatementList  ::= Statement (WS ";;" WS Statement)*
```

- `do (...)` 形式では括弧内に 1 つ以上のステートメントを `;;` 区切りで記述します。
- 単文ブロックであれば括弧を省略して `Statement` を直接書けます。

## `for each` / `parallel` 句

```ebnf
ForEachClause ::= WS "for" WS "each" WS "(" WS ForVarAssignments WS ")" WS BlockStatement
ParallelClause ::= WS "parallel" WS "(" WS ForVarAssignments WS ")" WS BlockStatement
```

- `Table` ステートメントに後続して書くことで、インラインの反復や並列実行を表現します。
  ```erq
  from data
    for each (@row)
      { process_row(@row) };;
  ```
- `parallel` は `runSqlsWithEnv` 内で子プロセスを生成し、各行を並列に処理します（クエリ初期化中は禁止）。

## 変数の表記 (`Variable`)

```ebnf
Variable ::= "@" Identifier
```

- すべての制御構文は `@name` 形式の識別子で実行時変数を参照します。
- `Identifier` は SQL の識別子規則に従い、必要に応じて自動でクォートされます。

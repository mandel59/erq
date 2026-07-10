# Operators

Representative operators and examples. Precedence mostly follows SQLite; use parentheses to disambiguate.

- Unary: `+x`, `-x`

  ```erq
  {+1};; {-1};;
  ```

- String concatenation: `||`

  ```erq
  {'a' || 'b'};;
  ```

- JSON extract: `expr -> 'key'`, `expr ->> 'key'` (text extract)

  ```erq
  {'{"a":1}' -> 'a'};;
  {'{"a":1}' ->> 'a'};;
  ```

- Arithmetic: `*` `/` `%` `+` `-`

  ```erq
  {1 * 2};; {1 / 2.0};; {1 % 2};; {1 + 2};; {1 - 2};;
  ```

- Bitwise: `&` `|` `<<` `>>` `~x`

  ```erq
  {1 & 2};; {1 | 2};; {1 << 2};; {1 >> 2};; {~1};;
  ```

- Comparison: `<` `<=` `>` `>=` `=` `==` `<>` `!=` `is` `is not`

  ```erq
  {1 < 2};; {1 >= 2};; {1 = 2};; {1 is not 2};;
  ```

- Range and set: `between ... and ...`, `in`, `not in`

  ```erq
  {1 between 2 and 3};; {1 not between 2 and 3};;
  {1 in [1, 2]};; {1 not in [1, 2]};;
  {1 in range(1, 10)};; {1 not in range(1, 10)};;
  ```

  Note: The right-hand side of `in` can be an array literal or a table expression.


- Pattern matching: `like`, `glob`, `regexp`, `match` and their `not` variants. `like ... escape '\'` is supported.

  ```erq
  {'a_b' like '_\__' escape '\'};;
  {'abc' like 'a%'};; {'abc' not like 'a%'};;
  {'abc' regexp '^a..$'};; {'abc' not regexp '^a..$'};;
  {'abc' glob 'a*'};; {'abc' not glob 'a*'};;
  ```

- Logical: `not` `and` `or`

  ```erq
  {not 0};; {1 and 1};; {1 or 1};;
  ```

- Collation: `expr collate 'nocase'`

  ```erq
  {'A' = 'a' collate 'nocase'};;
  ```

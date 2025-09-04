# JSON and Packing

Working with JSON and packing/unpacking values.

## CREATE TABLE ... FROM JSON

Create a table from JSON arrays or objects.

```erq
-- Load from a file using the readfile function
create table puppies from json ({readfile('examples/data/puppies.json')});;

-- Traverse array elements (via SQLite json_each)
puppies['Playful' in json_each(personality){value}]{name};;
```

## Pack / Unpack

Use `unpack <json> { a, b, ... }` to expand a JSON object into columns, and `pack { ... }` to assemble columns into JSON.

```erq
table j(value) = values [ '{"a":1,"b":2,"c":3}', '{"a":4,"b":5,"c":6}' ];;

table t = j
  { input: value, unpack value { a, b, c } }
  { *, sum: a + b + c };;

t;;

t { json: pack { a, b, c, sum } };;
```

When your input is JSON text, wrap it with `json(text)` as needed.

```erq
t { line: pack { input: json(input), args: [a, b, c], sum } || E'\n' } output raw;;
```

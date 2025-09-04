# Literals

Literal forms available in Erq.

- Numbers: integers/floats, digit separators `_`, exponent notation, and hexadecimal are supported.

```erq
{ n: 123 };;
{ n: 1.23 };;
{ n: 123_456 };;
{ n: 1.234_567 };;
{ n: 0xff_ff_ff_ff };;
{ n: 0xD012_345A };;
{ n: 1.000_1e10 };;
{ n: -1.000_1e-10 };;
```

- Strings: `'SQL-compatible'`, `"JSON-compatible"`, and escaped strings like `E'\n'`.

```erq
{ a: 'a', b: "b", c: E'line\nbreak' };;
```

- Arrays: list values in square brackets. Use [`pack` notation](./pack-unpack.md) to convert into JSON text.

```erq
{ xs: pack [1, 2, 3] };;
```

- Objects: list `key: expression` pairs in curly braces. Use [`pack` notation](./pack-unpack.md) to convert into JSON text.

```erq
{ obj: pack {a: 1, b: 'x'} };;
```

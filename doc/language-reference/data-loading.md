# Data Loading

Loading external data such as CSV/NDJSON.

## load table ... csv

```erq
load table data(id integer, name text, age integer) from 'data/names.csv' csv, header;;
```

- `header` treats the first row as a header.
- Delimiter, encoding and other options may be specified (subject to extensions).

## ndjson

Load NDJSON as one JSON value per line (use `json(...)` where necessary).

```erq
-- Unpack loaded JSON as needed
-- See examples/load-ndjson.erq for a complete example
```

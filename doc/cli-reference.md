# CLI Reference

This guide covers how to run the `erq` command‑line interface.

## Starting the CLI

Run `erq` with a SQLite database file. To execute a script, redirect the file into `erq`:

```shell
erq your_database.db < query.erq
```

Interactive mode starts when `erq` is invoked without redirecting a script. You can type queries directly:

```shell
erq your_database.db
```

## Options

| Option | Alias | Description |
|-------|-------|-------------|
| `--help` | `-h` | show Usage |
| `--version` | `-v` | show Version |
| `--load {path}` | `-l` | load extension |
| `--init {path}` | `-i` | path to initialize Erq file |
| `--format {mode}` | `-f` | output format |
| `--db {path}` | (default) | path to SQLite database file |
| `--var name=value` | – | set global variable |

## Examples

Run one of the sample queries included with the project:

```shell
node bin/erq-cli.js :memory: < examples/helloworld.erq
```

This connects to an in‑memory database and prints the result of `examples/helloworld.erq`.

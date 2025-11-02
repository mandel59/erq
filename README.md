# Erq - Easy Relational Query Language

## Introduction

Erq is an alternative query language for relational databases. It is designed to be easy to learn and use, while being as expressive and powerful as SQL.

I originally used SQLite to analyze my own kanji database. However, the verbose and cumbersome syntax of SQL prevented me from doing ad hoc analysis quickly. So I created Erq, which simplifies the syntax of SQL.

## Quickstart

See [Quickstart](./doc/quickstart.md) for installation instructions, CLI examples, and a minimal `.erq` script.

## Usage

Erq CLI works like SQLite CLI. You can use it to query SQLite databases.

Basically, you can use Erq CLI like this:

```shell
erq your_database.db <your_query.erq >your_output.txt
```

Or you can use it interactively:

```shell
erq your_database.db
```

## Debug Logging

Erq writes debug information to `stderr`. You can opt into specific groups by setting the `ERQ_DEBUG` environment variable to a space- or comma-separated list of categories.

Available categories include:

- `sql` – SQL statements generated during script execution or imports
- `script` – script-specific helpers such as loop conditions
- `import` – SQL emitted when loading external data sources
- `lifecycle` – parent/child process lifecycle events
- `ipc` – IPC messages (e.g. completer results)
- `stack` – stack traces for caught exceptions
- `preprocess` – interpolation details while expanding ERQ expressions
- `general` – legacy bucket that enables all historical debug output

You can combine categories (e.g. `ERQ_DEBUG=sql,stack`) or use `1`, `true`, or `all` to enable every debug message.

During an interactive session you can inspect or change the same setting with the `.debug` dot command, for example `.debug sql stack` to enable only SQL and stack trace logging or `.debug off` to disable it again.

## Dot Commands

Inside the interactive CLI you can enter dot-prefixed utility commands. Use `.help` to list them or `.help COMMAND` to see detailed usage. Tab completion now suggests dot command names as well as arguments such as `.format` modes or `.debug` categories.

## Syntax Comparison with SQL

See [Syntax Comparison with SQL](./doc/syntax-comparison.md).

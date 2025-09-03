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

## Syntax Comparison with SQL

See [Syntax Comparison with SQL](./doc/syntax-comparison.md).

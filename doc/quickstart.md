# Quickstart

## Installation

Install the CLI with npm:

```shell
npm install -g @mandel59/erq
```

## Running the CLI

After installing, run the CLI against a SQLite database:

```shell
erq your_database.db < query.erq
```

Interactive mode is also available:

```shell
erq your_database.db
```

## Minimal `.erq` example

The following script defines a table and outputs it:

```erq
table greeting(message) = values ['Hello, World'];;
greeting;;
```

Save it to a file like `hello.erq` and run:

```shell
erq :memory: < hello.erq
```

This prints the greeting table to standard output.

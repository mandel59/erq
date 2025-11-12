# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased](https://github.com/mandel59/erq/compare/v0.4.1...main)

## [0.4.1](https://github.com/mandel59/erq/compare/v0.4.0...v0.4.1) - 2025-11-13

### Added
- Added a `.editor` dot command that mirrors the Node.js REPL experience for drafting multi-line scripts before execution.

### Changed
- Updated the CLI autocompleter so `^`-prefixed correlated table shorthands only suggest schema and table names.
- Memoized parser output and enabled Peggy's cache to keep deeply nested correlated queries responsive across repeated parses.
- Upgraded `better-sqlite3` to 12.4.1 and refreshed the Vega toolchain (`vega` 6.0.0 / `vega-lite` 6.4.1).

### Fixed
- Corrected correlated join generation so filters stay scoped to their base tables, single-table aliases retain context for `^table` lookups, and compound aliases now raise errors instead of producing invalid SQL.
- Deferred REPL prompt redraws while scripts execute, preventing multi-line paste input from being corrupted in VS Code and similar terminals.

## [0.4.0](https://github.com/mandel59/erq/compare/v0.3.1...v0.4.0) - 2025-11-02

### Added
- Added automatic correlated subquery syntax using `^table`, including join support and a new `examples/correlate.erq`.
- Added `.help` meta command and enhanced meta command autocompletion for arguments and file paths.
- Added foreign key definition support to `create table` statements.

### Changed
- Introduced category-based debug logging with `.debug` toggles and moved SQL output off standard output.
- Expanded CLI and parser regression tests to cover control-flow scripts, output options, and common error cases.

### Fixed
- Fix debug log on `create table ... from json` syntax with column definitions.

## [0.3.1](https://github.com/mandel59/erq/compare/v0.3.0...v0.3.1) - 2025-09-03

### Added
- Added an example for `create table ... from json` syntax.

### Fixed
- Fixed `create table ... from json` syntax with table definitions.

## [0.3.0](https://github.com/mandel59/erq/compare/v0.2.2...v0.3.0) - 2025-06-04

### Added

- Add BlobLiteral support

### Fixed

- Fix query continuation detection
- Fix Infinity/-Infinity handling in JSON serialization
- Add directOnly flag to writefile function in global module

### Changed

- Update dependencies and lockfile version

## [0.2.2](https://github.com/mandel59/erq/compare/v0.2.1...v0.2.2) - 2025-04-16

### Added

- Add opendal module
- Add URL source and destination support
- Add skip records with error option for CSV loading

### Fixed

- Fix load extension handling
- Fix table-value function completion in autocompleter
- Fix module name completion in autocompleter
- Fix empty header handling

### Changed

- Refactor file handling and evaluation logic
- Change type of readable stream implementation

## [0.2.1](https://github.com/mandel59/erq/compare/v0.2.0...v0.2.1) - 2025-01-25

### Added

- Add CSV formatter options
- Add escape newline syntax

### Fixed

- Fix multiline string parsing in REPL

## [0.2.0](https://github.com/mandel59/erq/compare/v0.1.6...v0.2.0) - 2025-01-23

### Added

- Add sparse format options
- Add fs_find and path_join functions
- Add support for underscore characters in numeric literals
- Add brace-arrow aggregation syntax for Vega Lite

### Fixed

- Fix boolean values in pack body syntax
- Fix vacuum syntax
- Fix regexp_group handling
- Fix symbolic link handling in readlink

## [0.1.6](https://github.com/mandel59/erq/compare/v0.1.5...v0.1.6) - 2024-05-20

### Added

- Add cast option to `load table` command.

### Fixed

- Fix parsing of scientific notation in numeric literal.

## [0.1.5](https://github.com/mandel59/erq/compare/v0.1.4...v0.1.5) - 2024-04-02

### Fixed

- Fix duplicated or infinite matches in regexp_substr_all and regexp_all
- Add null checks to regexp functions

## [0.1.4](https://github.com/mandel59/erq/compare/v0.1.3...v0.1.4) - 2024-03-12

### Fixed

- load table: fix parsing errors.

## [0.1.3](https://github.com/mandel59/erq/compare/v0.1.2...v0.1.3) - 2024-03-12

### Added

- load table: add csv parsing options.

### Fixed

- load table: close file handle after error is raised.

## [0.1.2](https://github.com/mandel59/erq/compare/v0.1.1...v0.1.2) - 2024-02-23

### Added

- Parallel execution with `parallel` keyword.

### Changed

- Select statements are now able to start with `do` keyword.
  - Table with name `do` should be quoted with backticks.
- Initialization scripts now only accept statements. CLI commands are not allowed.

## [0.1.1](https://github.com/mandel59/erq/compare/v0.1.0...v0.1.1) - 2024-02-18

### Fixed

- Fixed type conversion error when outputting Vega Lite

## [0.1.0](https://github.com/mandel59/erq/releases/tag/v0.1.0) - 2024-02-16

### Added

- Initial release of the library.
- Basic functionality to analyze and manipulate SQLite databases.

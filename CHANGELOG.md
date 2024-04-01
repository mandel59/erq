# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [0.1.5] - 2024-04-02

### Fixed

- Fix duplicated or infinite matches in regexp_substr_all and regexp_all
- Add null checks to regexp functions

## [0.1.4] - 2024-03-12

### Fixed

- load table: fix parsing errors.

## [0.1.3] - 2024-03-12

### Added

- load table: add csv parsing options.

### Fixed

- load table: close file handle after error is raised.

## [0.1.2] - 2024-02-23

### Added

- Parallel execution with `parallel` keyword.

### Changed

- Select statements are now able to start with `do` keyword.
  - Table with name `do` should be quoted with backticks.
- Initialization scripts now only accept statements. CLI commands are not allowed.

## [0.1.1] - 2024-02-18

### Fixed

- Fixed type conversion error when outputting Vega Lite

## [0.1.0] - 2024-02-16

### Added

- Initial release of the library.
- Basic functionality to analyze and manipulate SQLite databases.

[0.1.5]: https://github.com/mandel59/erq/releases/tag/v0.1.5
[0.1.4]: https://github.com/mandel59/erq/releases/tag/v0.1.4
[0.1.3]: https://github.com/mandel59/erq/releases/tag/v0.1.3
[0.1.2]: https://github.com/mandel59/erq/releases/tag/v0.1.2
[0.1.1]: https://github.com/mandel59/erq/releases/tag/v0.1.1
[0.1.0]: https://github.com/mandel59/erq/releases/tag/v0.1.0

# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [0.1.2] - 2024-02-23

### Added

- Parallel execution with `parallel` keyword.

### Changed

- Select statements are now able to start with `do` keyword.
  - Table with name `do` should be quoted with backticks.
- Initialization scripts now only accept statements. CLI commands can't be used now.

## [0.1.1] - 2024-02-18

### Fixed

- Fixed type conversion error when outputting Vega Lite

## [0.1.0] - 2024-02-16

### Added

- Initial release of the library.
- Basic functionality to analyze and manipulate SQLite databases.

[0.1.2]: https://github.com/mandel59/erq/releases/tag/v0.1.2
[0.1.1]: https://github.com/mandel59/erq/releases/tag/v0.1.1
[0.1.0]: https://github.com/mandel59/erq/releases/tag/v0.1.0

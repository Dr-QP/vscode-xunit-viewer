# Change Log

All notable changes to the `vscode-xunit-viewer` extension are documented in this file.

## [Unreleased]

## [0.1.1] - 2026-07-08

### Fixed

- Fixed `ENOENT ... static/js` errors when opening a report on a machine other than the one that built the extension. The published `0.1.0` build predated the fix that rewrites `xunit-viewer`'s bundler-baked build-machine path to resolve relative to the installed extension at runtime.

### Changed

- Replaced the Node smoke test with a Jest test suite covering report generation and command behavior.
- Generate a linked sourcemap during build so breakpoints set in `src/extension.js` work in the `Run Extension` debug configuration.

## [0.1.0] - 2026-03-07

### Added

- Commands to open and refresh generated XUnit reports inside a VS Code webview.
- Configurable results path, output path, title, and ignore patterns.

# Change Log

All notable changes to the `vscode-xunit-viewer` extension are documented in this file.

## [Unreleased]

## [0.2.0] - 2026-07-10

### Added

- Live report updates: changes to watched XUnit result files now push an incremental update into an already-open report webview instead of doing a full reload, so view state (scroll position, expanded rows) is preserved.
- Support for excluding result files from discovery via ignore patterns matching basenames, recursive globs, and directory globs relative to the results path.

### Changed

- The bundled `xunit-viewer` renderer is now vendored and maintained in this repository instead of depended on from npm, and trimmed down to only what the extension needs (parsing and rendering); the standalone CLI, server, and terminal reporter were removed.
- File discovery, watching, and report asset generation now live in the extension itself instead of being split across the extension and the vendored CLI; watching no longer depends on `chokidar`.
- Migrated the extension source and test suite to TypeScript.
- Replaced the Node smoke test with a Jest test suite covering report generation and command behavior.
- Generate a linked sourcemap during build so breakpoints set in `src/extension.js` work in the `Run Extension` debug configuration.

### Fixed

- Fixed `ENOENT ... static/js` errors when opening a report on a machine other than the one that built the extension. The published `0.1.0` build predated the fix that rewrites `xunit-viewer`'s bundler-baked build-machine path to resolve relative to the installed extension at runtime.
- Fixed the extension not loading in dev containers.

## [0.1.0] - 2026-03-07

### Added

- Commands to open and refresh generated XUnit reports inside a VS Code webview.
- Configurable results path, output path, title, and ignore patterns.

xunit-viewer consolidation

Goal

Consolidate responsibility for file discovery, file watching, and report asset generation inside the extension build/runtime instead of splitting it between the extension and the vendored `xunit-viewer` CLI implementation. The current code already shows the split:

- `src/resultFiles.ts` discovers XML files with `workspace.findFiles`, but still uses Node `fs.stat` and `fs.access`.
- `src/reportGenerator.ts` delegates final HTML generation to the vendored `xunit-viewer` package.
- `xunit-viewer/src/cli/watch.js` still uses `chokidar`.
- `xunit-viewer/src/cli/render.js` still depends on a checked-in `src/cli/index.html` plus `src/cli/static/**` assets copied by `scripts/build.mjs`.

This work should end with one consistent model:

- VS Code owns workspace-relative path resolution, file discovery, and watching.
- The vendored viewer code becomes a pure parser/render runtime without its own filesystem watcher.
- The extension build produces the browser assets at build time instead of copying precompiled static output committed into `xunit-viewer/src/cli/static`.

Non-goals

- Do not change the user-facing commands or configuration keys unless required to support exclude semantics.
- Do not rewrite the React app itself unless needed to make runtime-built asset loading deterministic.
- Do not broaden scope into report content or parser behavior changes.

1. Replace chokidar watch with VS Code file watching

Current state

- The extension does not currently watch result files at all.
- The vendored CLI watch path lives in `xunit-viewer/src/cli/watch.js` and is only useful for the standalone CLI/server modes.
- `xunit-viewer/package.json` still lists `chokidar` as a dependency.

Target state

- When the extension panel is open, VS Code watches the configured results scope and refreshes the report when relevant XML files are created, changed, or deleted.
- The extension watch respects the same include/exclude rules as discovery.
- The vendored package no longer depends on `chokidar`.

Implementation

- Add extension-owned watch lifecycle management in `src/commands.ts` or a new `src/reportWatcher.ts`.
- Store the active watcher alongside `currentContext` so the watcher is disposed when:
	- the panel closes
	- the user opens a different workspace folder report
	- configuration affecting `resultsPath` or `ignorePatterns` changes
	- the extension deactivates
- Create the watcher with `vscode.workspace.createFileSystemWatcher(...)` using the same base path model as discovery.
- Watch at the directory level, then re-run filtering in extension code before refreshing. `createFileSystemWatcher` globbing is not expressive enough to encode all ignore cases by itself.
- Debounce refreshes in extension code to avoid multiple renders per test run burst.
- Do not keep the chokidar-based watcher in the vendored package. Replace `xunit-viewer/src/cli/watch.js` with a minimal Node `fs.watch` implementation only if standalone CLI watch support must remain. Otherwise remove watch mode from the vendored path used by the extension and document that the extension owns watch behavior.
- Remove `chokidar` from `xunit-viewer/package.json` once no import path references it.

Acceptance criteria

- Opening a report and then modifying an included XML file refreshes the webview automatically.
- Modifying an ignored XML file does not refresh the webview.
- Closing the panel disposes the watcher.
- `rg chokidar` returns no live import or dependency usage in the repository, except possibly changelog/history text.

Validation

- Add extension tests covering watcher registration/disposal and refresh debouncing.
- Run `bunx jest --runInBand`.

2. Migrate file discovery to VS Code workspace filesystem APIs and expand exclude support

Current state

- `src/resultFiles.ts` mixes Node filesystem checks with `workspace.findFiles`.
- Ignore handling is currently converted into one `RelativePattern` using `**/{...}`.
- The vendored `xunit-viewer/src/cli/get-files.js` has its own recursive Node scan with substring/regex-based ignore behavior.
- `generateReport()` still passes the raw `resultsPath` and `ignorePatterns` into the vendored library, so discovery rules are duplicated.

Problems in the current implementation

- `**/{pattern1,pattern2}` only handles a narrow subset of exclude patterns correctly.
- Users cannot reliably express directory excludes, deep glob excludes, or exact file exclusions with the current mapping.
- The extension validates that matching files exist, but the vendored library then rescans the filesystem with different semantics.

Target state

- The extension performs the single source of truth discovery pass.
- Discovery uses VS Code URI-based filesystem APIs for path existence and directory/file checks.
- Exclude patterns support the forms users reasonably expect relative to `resultsPath`, including:
	- file names such as `package.xml`
	- recursive globs such as `**/coverage/*.xml`
	- directory globs such as `**/CTestCostData.txt` or `**/testing/**`
- The render step receives an already-resolved file list instead of a root path plus ignore rules.

Implementation

- Replace `pathExists()` and `fs.stat()` usage in `src/resultFiles.ts` with `workspace.fs.stat(Uri.file(...))`.
- Split discovery into explicit steps:
	- resolve whether `resultsPath` is a file or directory via `workspace.fs.stat`
	- build a broad include set for candidate XML files
	- filter candidates in extension code against normalized ignore matchers
- Do not rely on `findFiles(..., exclude)` for full exclude semantics. Use it only for broad candidate collection, then apply matching in TypeScript.
- Introduce a small matcher layer in the extension for ignore patterns. The matcher should normalize to workspace-relative paths under `resultsPath` and support both basename-style ignores and glob-style ignores.
- Change `generateReport()` and the vendored entrypoint contract so the renderer can accept concrete file payloads or file paths gathered by the extension. That removes the second recursive scan in `xunit-viewer/src/cli/get-files.js` for extension-driven report generation.
- Keep the standalone CLI code path working by preserving a Node-side file discovery adapter inside `xunit-viewer`, but do not let the extension use it.

Suggested API shape

- Extension side:
	- `collectResultFiles(resultsUri: Uri, ignorePatterns: string[]): Promise<Uri[]>`
	- `readResultFiles(files: Uri[]): Promise<Array<{ file: string; contents: string }>>`
- Vendored renderer side:
	- accept `files` directly when provided
	- fall back to `results` scanning only for CLI mode

Acceptance criteria

- Discovery behavior is identical between pre-render validation and actual report generation.
- A configured single XML file path still works.
- Ignore patterns are evaluated relative to `resultsPath`, not the workspace root.
- Excluding a nested directory or globbed subset works in both validation and rendering.

Validation

- Add tests for basename ignores, nested glob ignores, and single-file `resultsPath` handling in `test/extension.test.ts`.
- Run `bunx jest --runInBand`.

3. Replace checked-in precompiled React assets with build-time generated assets

Current state

- `scripts/build.mjs` copies `node_modules/xunit-viewer/src/cli/index.html` and `src/cli/static/**` into `dist/`.
- `xunit-viewer/src/cli/render.js` reads `src/cli/index.html` and inlines files from `src/cli/static/js` and `src/cli/static/css`.
- The static bundle under `xunit-viewer/src/cli/static/**` is checked in and appears to be the output of a previous CRA build.

Problems in the current implementation

- The extension depends on generated frontend artifacts that are committed as source.
- Asset updates require manual sync between the React app and `src/cli/static`.
- The build script copies stale assets instead of building them.

Target state

- The frontend app is built during the extension build.
- The generated HTML shell and JS/CSS assets consumed by the renderer come from that build output, not checked-in precompiled files.
- The build is deterministic in CI and local development.

Implementation

- Decide on one source of truth for the frontend build output:
	- preferred: build the app from `xunit-viewer/src/index.js` and related sources into a generated directory under `xunit-viewer/build` or the extension `dist` tree
	- avoid continuing to treat `xunit-viewer/src/cli/static` as source
- Update `scripts/build.mjs` so it explicitly builds the viewer frontend before bundling or before asset copy steps.
- Replace the current `copyStaticAssets()` flow with a step that copies from fresh build output only.
- Remove checked-in generated files from:
	- `xunit-viewer/src/cli/static/**`
	- any stale generated `xunit-viewer/src/cli/index.html` variant if it is only a compiled shell
- Update `xunit-viewer/src/cli/render.js` to read from the generated build output location, or refactor it so the extension build embeds the generated asset strings directly.
- Keep the `renderSourcePathPattern` patch only if it is still required after the asset path cleanup. Re-evaluate whether the patch can be removed once render inputs are explicit.

Build options

- Short-term pragmatic path:
	- keep the vendored React toolchain
	- invoke its build from the root build script
	- copy the resulting built assets into extension `dist`
- Better long-term path:
	- replace CRA-era build plumbing in `xunit-viewer` with a modern bundler driven from the root package
	- emit a small asset manifest that `render.js` can consume directly

Acceptance criteria

- Running the root build from a clean checkout regenerates the viewer assets without relying on committed static output.
- Deleting generated frontend output and rerunning the build restores a working extension bundle.
- The final generated report still loads correctly inside the VS Code webview.

Validation

- Run `bun run build` from the repo root.
- Open the extension report against `test/fixtures` or `test/test_workspace/build` and confirm the webview renders.

Recommended execution order

1. Finish item 2 first so the extension owns canonical discovery and ignore semantics.
2. Add item 1 on top of the new discovery layer so watch refresh uses the same filter path.
3. Finish item 3 last because it affects the build and vendored asset layout, but not the extension contract if item 2 already passes file payloads into rendering.

Concrete file set expected to change

- Extension:
	- `src/resultFiles.ts`
	- `src/reportGenerator.ts`
	- `src/commands.ts`
	- `src/extension.ts`
	- `test/extension.test.ts`
- Vendored `xunit-viewer`:
	- `xunit-viewer/xunit-viewer.js`
	- `xunit-viewer/src/cli/get-files.js`
	- `xunit-viewer/src/cli/watch.js`
	- `xunit-viewer/src/cli/render.js`
	- `xunit-viewer/package.json`
- Build:
	- `scripts/build.mjs`

Definition of done

- The extension does not depend on `chokidar`.
- Discovery and watch filtering are implemented once in the extension.
- Rendering no longer depends on checked-in precompiled frontend assets.
- Root tests and build pass.

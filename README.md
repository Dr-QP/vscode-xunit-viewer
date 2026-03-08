# ROS2 XUnit Viewer

`vscode-xunit-viewer` packages the `xunit-viewer` npm library as a VS Code extension so ROS 2 developers can browse `colcon test` results without leaving the editor.

The extension is built and packaged with Bun. Use `bun install`, `bun run build`, `bun run test`, and `bun run package` for local development.

## Features

- Generates a searchable HTML report from the workspace `build/` directory.
- Opens the report in a VS Code webview with scripts and find enabled.
- Reuses the same ignore patterns as the existing Dr.QP CLI workflow for `Test.xml`, `coverage.xml`, and `package.xml`.
- Refreshes the active report from the command palette after new test runs.

## Commands

- `ROS2: Open XUnit Test Results`
- `ROS2: Refresh XUnit Test Results`

## Settings

- `vscode-xunit-viewer.resultsPath`: Folder that contains XUnit XML files. Defaults to `build`.
- `vscode-xunit-viewer.outputPath`: Generated HTML path. Defaults to `build/xunit-index.html`.
- `vscode-xunit-viewer.title`: Optional custom report title.
- `vscode-xunit-viewer.ignorePatterns`: Filename patterns ignored while scanning the results folder.

## Usage

1. Run your ROS 2 tests so XML results exist under `build/`.
2. Open the command palette in VS Code.
3. Run `ROS2: Open XUnit Test Results`.
4. Re-run the command or use `ROS2: Refresh XUnit Test Results` after another test pass.

## Development

Install `bun` `curl -fsSL https://bun.com/install | bash`

If you use Dev Containers, reopen the folder in the included container. It installs Bun and the system libraries commonly needed for VS Code extension authoring and extension-host test runs.

- `bun install` installs dependencies and generates the Bun lockfile.
- `bun run build` bundles the extension entrypoint into `dist/extension.js`.
- `bun run test` runs the Jest suite against the source module.
- `bun run package` creates a VSIX using `bunx @vscode/vsce`.

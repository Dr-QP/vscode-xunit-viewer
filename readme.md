# ROS2 XUnit Viewer

`ros2-xunit-viewer` packages the `xunit-viewer` npm library as a VS Code extension so ROS 2 developers can browse `colcon test` results without leaving the editor.

## Features

- Generates a searchable HTML report from the workspace `build/` directory.
- Opens the report in a VS Code webview with scripts and find enabled.
- Reuses the same ignore patterns as the existing Dr.QP CLI workflow for `Test.xml`, `coverage.xml`, and `package.xml`.
- Refreshes the active report from the command palette after new test runs.

## Commands

- `ROS2: Open XUnit Test Results`
- `ROS2: Refresh XUnit Test Results`

## Settings

- `ros2-xunit-viewer.resultsPath`: Folder that contains XUnit XML files. Defaults to `build`.
- `ros2-xunit-viewer.outputPath`: Generated HTML path. Defaults to `build/xunit-index.html`.
- `ros2-xunit-viewer.title`: Optional custom report title.
- `ros2-xunit-viewer.ignorePatterns`: Filename patterns ignored while scanning the results folder.

## Usage

1. Run your ROS 2 tests so XML results exist under `build/`.
2. Open the command palette in VS Code.
3. Run `ROS2: Open XUnit Test Results`.
4. Re-run the command or use `ROS2: Refresh XUnit Test Results` after another test pass.

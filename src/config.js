const path = require('node:path');

const {
  EXTENSION_ID,
  DEFAULT_RESULTS_PATH,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_IGNORE_PATTERNS,
} = require('./constants');
const { getVscode } = require('./vscodeHost');

function resolveWorkspacePath(workspaceRoot, configuredPath, fallbackPath) {
  const selectedPath = configuredPath && configuredPath.trim() !== '' ? configuredPath : fallbackPath;
  return path.isAbsolute(selectedPath)
    ? path.normalize(selectedPath)
    : path.join(workspaceRoot, selectedPath);
}

function getWorkspaceConfiguration(workspaceFolder) {
  const vscode = getVscode();
  return vscode.workspace.getConfiguration(EXTENSION_ID, workspaceFolder);
}

function buildReportOptions(workspaceFolder) {
  const configuration = getWorkspaceConfiguration(workspaceFolder);
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const titleOverride = configuration.get('title', '').trim();

  return {
    workspaceFolder,
    resultsPath: resolveWorkspacePath(
      workspaceRoot,
      configuration.get('resultsPath', DEFAULT_RESULTS_PATH),
      DEFAULT_RESULTS_PATH,
    ),
    outputPath: resolveWorkspacePath(
      workspaceRoot,
      configuration.get('outputPath', DEFAULT_OUTPUT_PATH),
      DEFAULT_OUTPUT_PATH,
    ),
    title: titleOverride || `${workspaceFolder.name} XUnit Test Results`,
    ignorePatterns: configuration.get('ignorePatterns', DEFAULT_IGNORE_PATTERNS),
  };
}

module.exports = { buildReportOptions };

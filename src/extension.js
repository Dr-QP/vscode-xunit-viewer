const fs = require('node:fs/promises');
const path = require('node:path');

const EXTENSION_ID = 'vscode-xunit-viewer';
const VIEW_TYPE = 'vscode-xunit-viewer.report';
const DEFAULT_RESULTS_PATH = 'build';
const DEFAULT_OUTPUT_PATH = path.join('build', 'xunit-index.html');
const DEFAULT_IGNORE_PATTERNS = ['Test.xml', 'coverage.xml', 'package.xml'];

let currentPanel;
let currentContext;
let cachedXunitViewer;

function getVscode() {
  // Delay loading the VS Code host module so Node-side tests can import this file.
  return require('vscode');
}

function getXunitViewer() {
  if (!cachedXunitViewer) {
    const xunitViewerModule = require('xunit-viewer');
    cachedXunitViewer = xunitViewerModule.default ?? xunitViewerModule;
  }

  return cachedXunitViewer;
}

function pathExists(targetPath) {
  return fs
    .access(targetPath)
    .then(() => true)
    .catch(() => false);
}

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

async function pickWorkspaceFolder(commandTarget) {
  const vscode = getVscode();
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) {
    return undefined;
  }

  if (commandTarget instanceof vscode.Uri) {
    return vscode.workspace.getWorkspaceFolder(commandTarget) ?? workspaceFolders[0];
  }

  if (workspaceFolders.length === 1) {
    return workspaceFolders[0];
  }

  return vscode.window.showWorkspaceFolderPick({
    placeHolder: 'Select the workspace to scan for XUnit results',
  });
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

async function generateReport({ resultsPath, outputPath, title, ignorePatterns }) {
  const xunitViewer = getXunitViewer();

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await xunitViewer({
    results: resultsPath,
    output: outputPath,
    title,
    ignore: ignorePatterns,
    server: false,
    script: true,
  });

  const html = await fs.readFile(outputPath, 'utf8');
  return {
    html,
    outputPath,
  };
}

function ensurePanel(title) {
  const vscode = getVscode();
  if (currentPanel) {
    currentPanel.title = title;
    return currentPanel;
  }

  currentPanel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    title,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      enableFindWidget: true,
      retainContextWhenHidden: true,
    },
  );

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
    currentContext = undefined;
  });

  return currentPanel;
}

async function showReport(workspaceFolder) {
  const vscode = getVscode();
  const reportOptions = buildReportOptions(workspaceFolder);
  const { resultsPath, outputPath, title } = reportOptions;

  if (!(await pathExists(resultsPath))) {
    throw new Error(
      `Results path does not exist: ${resultsPath}. Run colcon tests first or update ${EXTENSION_ID}.resultsPath.`,
    );
  }

  const report = await generateReport(reportOptions);
  const panel = ensurePanel(title);
  panel.webview.html = report.html;
  panel.reveal(vscode.ViewColumn.One);

  currentContext = {
    workspaceFolder,
    outputPath,
  };

  return report;
}

async function openReport(commandTarget) {
  const vscode = getVscode();
  const workspaceFolder = await pickWorkspaceFolder(commandTarget);
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Open a workspace folder before viewing ROS 2 test results.');
    return;
  }

  try {
    const report = await showReport(workspaceFolder);
    const relativeOutputPath = path.relative(workspaceFolder.uri.fsPath, report.outputPath);
    vscode.window.setStatusBarMessage(`ROS2 XUnit Viewer refreshed ${relativeOutputPath}`, 4000);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ROS2 XUnit Viewer failed: ${message}`);
  }
}

async function refreshReport() {
  const vscode = getVscode();
  if (!currentContext) {
    vscode.window.showInformationMessage('Open XUnit test results first.');
    return;
  }

  await openReport(currentContext.workspaceFolder.uri);
}

function activate(context) {
  const vscode = getVscode();
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.openReport`, openReport),
    vscode.commands.registerCommand(`${EXTENSION_ID}.refreshReport`, refreshReport),
  );
}

function deactivate() {
  currentPanel = undefined;
  currentContext = undefined;
}

module.exports = {
  activate,
  deactivate,
  buildReportOptions,
  generateReport,
  DEFAULT_IGNORE_PATTERNS,
};

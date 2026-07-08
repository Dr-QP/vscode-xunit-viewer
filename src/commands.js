const path = require('node:path');

const { EXTENSION_ID } = require('./constants');
const { getVscode } = require('./vscodeHost');
const { buildReportOptions } = require('./config');
const { pathExists, collectResultFiles } = require('./resultFiles');
const { generateReport } = require('./reportGenerator');
const { ensurePanel, resetPanel } = require('./panel');

let currentContext;

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

async function showReport(workspaceFolder) {
  const vscode = getVscode();
  const reportOptions = buildReportOptions(workspaceFolder);
  const { resultsPath, outputPath, title, ignorePatterns } = reportOptions;

  if (!(await pathExists(resultsPath))) {
    throw new Error(
      `Results path does not exist: ${resultsPath}. Run colcon tests first or update ${EXTENSION_ID}.resultsPath.`,
    );
  }

  const resultFiles = await collectResultFiles(resultsPath, ignorePatterns);
  if (resultFiles.length === 0) {
    throw new Error(
      `No usable xUnit XML files were found in ${resultsPath}. Run colcon tests first or update ${EXTENSION_ID}.resultsPath or ${EXTENSION_ID}.ignorePatterns.`,
    );
  }

  const report = await generateReport(reportOptions);
  const panel = ensurePanel(title, () => {
    currentContext = undefined;
  });
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
    vscode.window.showErrorMessage('Open a workspace folder before viewing XUnit test results.');
    return;
  }

  try {
    const report = await showReport(workspaceFolder);
    const relativeOutputPath = path.relative(workspaceFolder.uri.fsPath, report.outputPath);
    vscode.window.setStatusBarMessage(`XUnit Viewer refreshed ${relativeOutputPath}`, 4000);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`XUnit Viewer failed: ${message}`);
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

function resetState() {
  currentContext = undefined;
  resetPanel();
}

module.exports = { openReport, refreshReport, resetState };

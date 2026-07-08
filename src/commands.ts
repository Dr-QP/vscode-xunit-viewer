import path from 'node:path';
import type { Uri, WorkspaceFolder } from 'vscode';

import { EXTENSION_ID } from './constants';
import { getVscode } from './vscodeHost';
import { buildReportOptions } from './config';
import { pathExists, collectResultFiles } from './resultFiles';
import { generateReport, type GeneratedReport } from './reportGenerator';
import { ensurePanel, resetPanel } from './panel';

interface ReportContext {
  workspaceFolder: WorkspaceFolder;
  outputPath: string;
}

let currentContext: ReportContext | undefined;

async function pickWorkspaceFolder(commandTarget: Uri | unknown): Promise<WorkspaceFolder | undefined> {
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

async function showReport(workspaceFolder: WorkspaceFolder): Promise<GeneratedReport> {
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

export async function openReport(commandTarget?: Uri | unknown): Promise<void> {
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

export async function refreshReport(): Promise<void> {
  const vscode = getVscode();
  if (!currentContext) {
    vscode.window.showInformationMessage('Open XUnit test results first.');
    return;
  }

  await openReport(currentContext.workspaceFolder.uri);
}

export function resetState(): void {
  currentContext = undefined;
  resetPanel();
}

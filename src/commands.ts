import path from 'node:path';
import type { ConfigurationChangeEvent, Disposable, Uri, WorkspaceFolder } from 'vscode';

import { EXTENSION_ID } from './constants';
import { getVscode } from './vscodeHost';
import { buildReportOptions } from './config';
import { collectResultFiles, readResultFiles, statUri } from './resultFiles';
import { generateReport, type GeneratedReport } from './reportGenerator';
import { createReportWatcher } from './reportWatcher';
import { ensurePanel, resetPanel } from './panel';

interface ReportContext {
  workspaceFolder: WorkspaceFolder;
  outputPath: string;
  watcher: Disposable;
}

let currentContext: ReportContext | undefined;

function disposeCurrentWatcher(): void {
  currentContext?.watcher.dispose();
}

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
  const resultsUri = vscode.Uri.file(resultsPath);

  const stat = await statUri(resultsUri);
  if (!stat) {
    throw new Error(
      `Results path does not exist: ${resultsPath}. Run colcon tests first or update ${EXTENSION_ID}.resultsPath.`,
    );
  }

  const resultFiles = await collectResultFiles(resultsUri, stat, ignorePatterns);
  if (resultFiles.length === 0) {
    throw new Error(
      `No usable xUnit XML files were found in ${resultsPath}. Run colcon tests first or update ${EXTENSION_ID}.resultsPath or ${EXTENSION_ID}.ignorePatterns.`,
    );
  }

  const files = await readResultFiles(resultFiles);
  const report = await generateReport({ files, outputPath, title });

  const panel = ensurePanel(title, () => {
    disposeCurrentWatcher();
    currentContext = undefined;
  });
  panel.webview.html = report.html;
  panel.reveal(vscode.ViewColumn.One);

  // Replace any previous watcher so refresh always tracks the currently active
  // results scope and ignore rules (same filter path as discovery).
  disposeCurrentWatcher();
  const watcher = createReportWatcher({
    resultsUri,
    stat,
    ignorePatterns,
    onChange: () => {
      void regenerateReport(workspaceFolder);
    },
  });

  currentContext = {
    workspaceFolder,
    outputPath,
    watcher,
  };

  return report;
}

function reportFailure(error: unknown): void {
  const vscode = getVscode();
  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(`XUnit Viewer failed: ${message}`);
}

async function regenerateReport(workspaceFolder: WorkspaceFolder): Promise<void> {
  try {
    await showReport(workspaceFolder);
  } catch (error) {
    reportFailure(error);
  }
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
    reportFailure(error);
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

export async function handleConfigurationChange(event: ConfigurationChangeEvent): Promise<void> {
  if (!currentContext) {
    return;
  }

  const { workspaceFolder } = currentContext;
  if (!event.affectsConfiguration(EXTENSION_ID, workspaceFolder.uri)) {
    return;
  }

  await openReport(workspaceFolder.uri);
}

export function resetState(): void {
  disposeCurrentWatcher();
  currentContext = undefined;
  resetPanel();
}

import path from 'node:path';
import type { WorkspaceConfiguration, WorkspaceFolder } from 'vscode';

import {
  EXTENSION_ID,
  DEFAULT_RESULTS_PATH,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_IGNORE_PATTERNS,
} from './constants';
import { getVscode } from './vscodeHost';

export interface ReportOptions {
  workspaceFolder: WorkspaceFolder;
  resultsPath: string;
  outputPath: string;
  title: string;
  ignorePatterns: string[];
}

function resolveWorkspacePath(workspaceRoot: string, configuredPath: string, fallbackPath: string): string {
  const selectedPath = configuredPath && configuredPath.trim() !== '' ? configuredPath : fallbackPath;
  return path.isAbsolute(selectedPath)
    ? path.normalize(selectedPath)
    : path.join(workspaceRoot, selectedPath);
}

function getWorkspaceConfiguration(workspaceFolder: WorkspaceFolder): WorkspaceConfiguration {
  const vscode = getVscode();
  return vscode.workspace.getConfiguration(EXTENSION_ID, workspaceFolder);
}

export function buildReportOptions(workspaceFolder: WorkspaceFolder): ReportOptions {
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
    ignorePatterns: configuration.get('ignorePatterns', [...DEFAULT_IGNORE_PATTERNS]),
  };
}

import type { ExtensionContext } from 'vscode';

import { EXTENSION_ID, DEFAULT_IGNORE_PATTERNS } from './constants';
import { getVscode } from './vscodeHost';
import { buildReportOptions } from './config';
import { generateReport } from './reportGenerator';
import { openReport, refreshReport, handleConfigurationChange, resetState } from './commands';

export function activate(context: ExtensionContext): void {
  const vscode = getVscode();
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.openReport`, openReport),
    vscode.commands.registerCommand(`${EXTENSION_ID}.refreshReport`, refreshReport),
    vscode.workspace.onDidChangeConfiguration(handleConfigurationChange),
  );
}

export function deactivate(): void {
  resetState();
}

export { buildReportOptions, generateReport, DEFAULT_IGNORE_PATTERNS };

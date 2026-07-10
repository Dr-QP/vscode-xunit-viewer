import type { WebviewPanel } from 'vscode';

import { VIEW_TYPE } from './constants';
import { getVscode } from './vscodeHost';

let currentPanel: WebviewPanel | undefined;

export function ensurePanel(title: string, onDidDispose?: () => void): WebviewPanel {
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
    onDidDispose?.();
  });

  return currentPanel;
}

/** The currently open report panel, or `undefined` when none is open. */
export function getPanel(): WebviewPanel | undefined {
  return currentPanel;
}

export function resetPanel(): void {
  currentPanel = undefined;
}

const { VIEW_TYPE } = require('./constants');
const { getVscode } = require('./vscodeHost');

let currentPanel;

function ensurePanel(title, onDidDispose) {
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

function resetPanel() {
  currentPanel = undefined;
}

module.exports = { ensurePanel, resetPanel };

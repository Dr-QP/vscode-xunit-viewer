const { EXTENSION_ID, DEFAULT_IGNORE_PATTERNS } = require('./constants');
const { getVscode } = require('./vscodeHost');
const { buildReportOptions } = require('./config');
const { generateReport } = require('./reportGenerator');
const { openReport, refreshReport, resetState } = require('./commands');

function activate(context) {
  const vscode = getVscode();
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.openReport`, openReport),
    vscode.commands.registerCommand(`${EXTENSION_ID}.refreshReport`, refreshReport),
  );
}

function deactivate() {
  resetState();
}

module.exports = {
  activate,
  deactivate,
  buildReportOptions,
  generateReport,
  DEFAULT_IGNORE_PATTERNS,
};

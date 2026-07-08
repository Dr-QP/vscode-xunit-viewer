const fs = require('node:fs/promises');
const path = require('node:path');

const { getVscode } = require('./vscodeHost');

function pathExists(targetPath) {
  return fs
    .access(targetPath)
    .then(() => true)
    .catch(() => false);
}

async function collectResultFiles(resultsPath, ignorePatterns) {
  const vscode = getVscode();
  const stats = await fs.stat(resultsPath);
  const searchBase = stats.isDirectory() ? resultsPath : path.dirname(resultsPath);
  const includeGlob = stats.isDirectory() ? '**/*.xml' : path.basename(resultsPath);

  const excludeGlob = ignorePatterns.length > 0
    ? new vscode.RelativePattern(searchBase, `**/{${ignorePatterns.join(',')}}`)
    : null;

  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(searchBase, includeGlob),
    excludeGlob,
  );

  return uris
    .map((uri) => uri.fsPath)
    .filter((filePath) => filePath.endsWith('.xml'))
    .sort();
}

module.exports = { pathExists, collectResultFiles };

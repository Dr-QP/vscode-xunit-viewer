function getVscode() {
  // Delay loading the VS Code host module so Node-side tests can import this file.
  return require('vscode');
}

module.exports = { getVscode };

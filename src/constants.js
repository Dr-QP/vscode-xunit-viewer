const path = require('node:path');

const EXTENSION_ID = 'vscode-xunit-viewer';
const VIEW_TYPE = 'vscode-xunit-viewer.report';
const DEFAULT_RESULTS_PATH = 'build';
const DEFAULT_OUTPUT_PATH = path.join('build', 'xunit-index.html');
const DEFAULT_IGNORE_PATTERNS = ['Test.xml', 'coverage.xml', 'package.xml'];

module.exports = {
  EXTENSION_ID,
  VIEW_TYPE,
  DEFAULT_RESULTS_PATH,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_IGNORE_PATTERNS,
};

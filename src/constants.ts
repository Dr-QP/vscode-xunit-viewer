import path from 'node:path';

export const EXTENSION_ID = 'vscode-xunit-viewer';
export const VIEW_TYPE = 'vscode-xunit-viewer.report';
export const DEFAULT_RESULTS_PATH = 'build';
export const DEFAULT_OUTPUT_PATH = path.join('build', 'xunit-index.html');
export const DEFAULT_IGNORE_PATTERNS: readonly string[] = ['Test.xml', 'coverage.xml', 'package.xml'];

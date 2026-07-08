import fs from 'node:fs/promises';
import path from 'node:path';

import { getVscode } from './vscodeHost';

export function pathExists(targetPath: string): Promise<boolean> {
  return fs
    .access(targetPath)
    .then(() => true)
    .catch(() => false);
}

export async function collectResultFiles(resultsPath: string, ignorePatterns: string[]): Promise<string[]> {
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

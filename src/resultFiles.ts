import path from 'node:path';
import type { FileStat, Uri } from 'vscode';

import { getVscode } from './vscodeHost';
import { createIgnoreMatcher } from './ignoreMatcher';

export interface ResultFilePayload {
  file: string;
  contents: string;
}

/** Resolve the `FileStat` for a URI, or `undefined` when it does not exist. */
export async function statUri(target: Uri): Promise<FileStat | undefined> {
  const vscode = getVscode();
  try {
    return await vscode.workspace.fs.stat(target);
  } catch {
    return undefined;
  }
}

function toRelativePosixPath(baseFsPath: string, fileFsPath: string): string {
  return path.relative(baseFsPath, fileFsPath).split(path.sep).join('/');
}

/**
 * Single source of truth for result-file discovery.
 *
 * `findFiles` is used only for broad candidate collection; all ignore semantics
 * are applied in extension code so that directory, deep-glob, and exact-file
 * excludes behave consistently and are evaluated relative to `resultsUri`.
 */
export async function collectResultFiles(
  resultsUri: Uri,
  stat: FileStat,
  ignorePatterns: string[],
): Promise<Uri[]> {
  const vscode = getVscode();
  const isDirectory = (stat.type & vscode.FileType.Directory) !== 0;

  // A configured single XML file path is used verbatim.
  if (!isDirectory) {
    return [resultsUri];
  }

  const candidates = await vscode.workspace.findFiles(
    new vscode.RelativePattern(resultsUri, '**/*.xml'),
  );

  const matcher = createIgnoreMatcher(ignorePatterns);
  const baseFsPath = resultsUri.fsPath;

  return candidates
    .filter((uri) => uri.fsPath.endsWith('.xml'))
    .filter((uri) => !matcher.isIgnored(toRelativePosixPath(baseFsPath, uri.fsPath)))
    .sort((a, b) => a.fsPath.localeCompare(b.fsPath));
}

/** Read the resolved result files into `{ file, contents }` render payloads. */
export async function readResultFiles(files: Uri[]): Promise<ResultFilePayload[]> {
  const vscode = getVscode();
  const payloads: ResultFilePayload[] = [];

  for (const uri of files) {
    const bytes = await vscode.workspace.fs.readFile(uri);
    payloads.push({
      file: uri.fsPath,
      contents: Buffer.from(bytes).toString('utf8'),
    });
  }

  return payloads;
}

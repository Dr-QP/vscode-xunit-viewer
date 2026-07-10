import path from 'node:path';
import type { Disposable, FileStat, Uri } from 'vscode';

import { getVscode } from './vscodeHost';
import { createIgnoreMatcher } from './ignoreMatcher';

/** Delay applied before refreshing so a burst of test writes renders once. */
export const WATCH_DEBOUNCE_MS = 250;

export interface ReportWatcherOptions {
  resultsUri: Uri;
  stat: FileStat;
  ignorePatterns: string[];
  onChange: () => void;
  debounceMs?: number;
}

function toRelativePosixPath(baseFsPath: string, fileFsPath: string): string {
  return path.relative(baseFsPath, fileFsPath).split(path.sep).join('/');
}

/**
 * Watch the configured results scope with VS Code's file-system watcher.
 *
 * The watcher globs broadly at the directory level and re-applies the same
 * ignore semantics as discovery in extension code, because
 * `createFileSystemWatcher` glob support is not expressive enough to encode all
 * ignore cases. Refreshes are debounced to avoid multiple renders per test run.
 */
export function createReportWatcher({
  resultsUri,
  stat,
  ignorePatterns,
  onChange,
  debounceMs = WATCH_DEBOUNCE_MS,
}: ReportWatcherOptions): Disposable {
  const vscode = getVscode();
  const isDirectory = (stat.type & vscode.FileType.Directory) !== 0;

  // For a directory, watch every XML file beneath it; for a single configured
  // file, watch that file's containing directory scoped to its basename.
  const watchBaseFsPath = isDirectory ? resultsUri.fsPath : path.dirname(resultsUri.fsPath);
  const watchGlob = isDirectory ? '**/*.xml' : path.basename(resultsUri.fsPath);
  const watchBaseUri = vscode.Uri.file(watchBaseFsPath);

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(watchBaseUri, watchGlob),
  );

  const matcher = createIgnoreMatcher(ignorePatterns);
  const relativeBaseFsPath = isDirectory ? resultsUri.fsPath : watchBaseFsPath;

  let timer: ReturnType<typeof setTimeout> | undefined;

  const scheduleRefresh = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      onChange();
    }, debounceMs);
  };

  const handleEvent = (uri: Uri): void => {
    if (!uri.fsPath.endsWith('.xml')) {
      return;
    }
    if (isDirectory && matcher.isIgnored(toRelativePosixPath(relativeBaseFsPath, uri.fsPath))) {
      return;
    }
    scheduleRefresh();
  };

  const subscriptions: Disposable[] = [
    watcher,
    watcher.onDidCreate(handleEvent),
    watcher.onDidChange(handleEvent),
    watcher.onDidDelete(handleEvent),
  ];

  return {
    dispose(): void {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      for (const subscription of subscriptions) {
        subscription.dispose();
      }
    },
  };
}

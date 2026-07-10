import fs from 'node:fs/promises';
import path from 'node:path';
import type { XunitViewer } from 'xunit-viewer';

import type { ResultFilePayload } from './resultFiles';

export interface GenerateReportOptions {
  files: ResultFilePayload[];
  outputPath: string;
  title: string;
}

export interface GeneratedReport {
  html: string;
  outputPath: string;
}

let cachedXunitViewer: XunitViewer | undefined;

function getXunitViewer(): XunitViewer {
  if (!cachedXunitViewer) {
    // Delay loading so tests can register mocks before the module is required.
    const xunitViewerModule = require('xunit-viewer') as XunitViewer & { default?: XunitViewer };
    cachedXunitViewer = xunitViewerModule.default ?? xunitViewerModule;
  }

  return cachedXunitViewer;
}

export async function generateReport({
  files,
  outputPath,
  title,
}: GenerateReportOptions): Promise<GeneratedReport> {
  const xunitViewer = getXunitViewer();

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  // The extension owns discovery; the renderer receives an already-resolved
  // file payload rather than rescanning the filesystem with its own semantics.
  await xunitViewer({
    files,
    output: outputPath,
    title,
    server: false,
    script: true,
  });

  const html = await fs.readFile(outputPath, 'utf8');
  return {
    html,
    outputPath,
  };
}

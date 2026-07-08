import fs from 'node:fs/promises';
import path from 'node:path';
import type { XunitViewer } from 'xunit-viewer';

export interface GenerateReportOptions {
  resultsPath: string;
  outputPath: string;
  title: string;
  ignorePatterns: string[];
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
  resultsPath,
  outputPath,
  title,
  ignorePatterns,
}: GenerateReportOptions): Promise<GeneratedReport> {
  const xunitViewer = getXunitViewer();

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await xunitViewer({
    results: resultsPath,
    output: outputPath,
    title,
    ignore: ignorePatterns,
    server: false,
    script: true,
  });

  const html = await fs.readFile(outputPath, 'utf8');
  return {
    html,
    outputPath,
  };
}

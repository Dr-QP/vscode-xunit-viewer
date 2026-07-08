const fs = require('node:fs/promises');
const path = require('node:path');

let cachedXunitViewer;

function getXunitViewer() {
  if (!cachedXunitViewer) {
    const xunitViewerModule = require('xunit-viewer');
    cachedXunitViewer = xunitViewerModule.default ?? xunitViewerModule;
  }

  return cachedXunitViewer;
}

async function generateReport({ resultsPath, outputPath, title, ignorePatterns }) {
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

module.exports = { generateReport };

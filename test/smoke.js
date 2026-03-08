const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const { DEFAULT_IGNORE_PATTERNS, generateReport } = require('../dist/extension.js');

async function main() {
  const fixturesPath = path.join(__dirname, 'fixtures');
  const outputPath = path.join(__dirname, 'artifacts', 'fixture-report.html');

  const report = await generateReport({
    resultsPath: fixturesPath,
    outputPath,
    title: 'Fixture Results',
    ignorePatterns: DEFAULT_IGNORE_PATTERNS,
  });

  const generatedHtml = await fs.readFile(outputPath, 'utf8');
  assert.ok(generatedHtml.includes('Fixture Results'));
  assert.ok(generatedHtml.length > 1000);
  assert.equal(report.outputPath, outputPath);

  console.log(`Generated fixture report at ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

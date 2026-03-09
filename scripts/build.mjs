import path from 'node:path';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const bundlePath = path.join(distDir, 'extension.js');
const xunitCliDir = path.join(rootDir, 'node_modules', 'xunit-viewer', 'src', 'cli');
const xunitIndexPath = path.join(xunitCliDir, 'index.html');
const xunitStaticDir = path.join(xunitCliDir, 'static');

function fail(message) {
  console.error(`[build] ${message}`);
  process.exit(1);
}

async function patchXunitViewerSourcePath(source) {
  const renderSourcePathPattern =
    /__filename2 = import_url\.fileURLToPath\("file:\/\/[^\"]*node_modules\/xunit-viewer\/src\/cli\/render\.js"\);/;

  if (!renderSourcePathPattern.test(bundleSource)) {
    fail('failed to locate xunit-viewer render path patch target in bundle');
  }

  bundleSource = bundleSource.replace(
    renderSourcePathPattern,
    '__filename2 = __filename;',
  );
  await writeFile(bundlePath, bundleSource, 'utf8');
}

const buildResult = await Bun.build({
  entrypoints: ['./src/extension.js'],
  outdir: './dist',
  target: 'node',
  format: 'cjs',
  external: ['vscode'],
});

if (!buildResult.success) {
  for (const log of buildResult.logs) {
    console.error(log);
  }
  fail('bun build failed');
}

let bundleSource = await readFile(bundlePath, 'utf8');
await patchXunitViewerSourcePath(bundleSource);

await mkdir(distDir, { recursive: true });
await cp(xunitIndexPath, path.join(distDir, 'index.html'));
await rm(path.join(distDir, 'static'), { recursive: true, force: true });
await cp(xunitStaticDir, path.join(distDir, 'static'), { recursive: true });

console.log('[build] bundle complete with embedded xunit-viewer static assets');

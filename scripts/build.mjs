import path from 'node:path';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const bundlePath = path.join(distDir, 'extension.js');
const xunitCliDir = path.join(rootDir, 'node_modules', 'xunit-viewer', 'src', 'cli');
const xunitIndexPath = path.join(xunitCliDir, 'index.html');
const xunitStaticDir = path.join(xunitCliDir, 'static');
const renderSourcePathPattern =
  /__filename2 = import_url\.fileURLToPath\("file:\/\/[^"]*node_modules\/xunit-viewer\/src\/cli\/render\.js"\);/;
const buildOptions = {
  entrypoints: ['./src/extension.ts'],
  outdir: './dist',
  target: 'node',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: 'linked',
};

await main();
console.log('[build] bundle complete with embedded xunit-viewer static assets');

async function main() {
  await buildExtensionBundle();
  await rewriteBundledRenderPath();
  await copyStaticAssets();
}

async function buildExtensionBundle() {
  const buildResult = await Bun.build(buildOptions);

  if (!buildResult.success) {
    for (const log of buildResult.logs) {
      console.error(log);
    }
    fail('bun build failed');
  }
}

function fail(message) {
  console.error(`[build] ${message}`);
  process.exit(1);
}

async function rewriteBundledRenderPath() {
  const bundleSource = await readFile(bundlePath, 'utf8');
  const patchedBundleSource = patchXunitViewerSourcePath(bundleSource);

  await writeFile(bundlePath, patchedBundleSource, 'utf8');
}

function patchXunitViewerSourcePath(source) {
  if (!renderSourcePathPattern.test(source)) {
    fail('failed to locate xunit-viewer render path patch target in bundle');
  }

  return source.replace(
    renderSourcePathPattern,
    '__filename2 = __filename;',
  );
}

async function copyStaticAssets() {
  await mkdir(distDir, { recursive: true });
  await cp(xunitIndexPath, path.join(distDir, 'index.html'));
  await rm(path.join(distDir, 'static'), { recursive: true, force: true });
  await cp(xunitStaticDir, path.join(distDir, 'static'), { recursive: true });
}

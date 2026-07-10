import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const bundlePath = path.join(distDir, 'extension.js');

// Source of truth: the vendored viewer package. Frontend assets are built from
// its React sources at build time rather than copied from checked-in output.
const viewerDir = path.join(rootDir, 'xunit-viewer');
const viewerCliDir = path.join(viewerDir, 'src', 'cli');
const viewerTemplatePath = path.join(viewerCliDir, 'index.html');
const viewerBuildStaticDir = path.join(viewerDir, 'build', 'static');
const reactScriptsBin = path.join(rootDir, 'node_modules', '.bin', 'react-scripts');

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
console.log('[build] bundle complete with freshly built xunit-viewer assets');

async function main() {
  await buildViewerFrontend();
  await buildExtensionBundle();
  await rewriteBundledRenderPath();
  await copyGeneratedAssets();
}

function buildViewerFrontend() {
  console.log('[build] building xunit-viewer frontend assets');
  const result = spawnSync(reactScriptsBin, ['build'], {
    cwd: viewerDir,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
  });

  if (result.error) {
    fail(`failed to run react-scripts build: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`react-scripts build exited with code ${result.status}`);
  }
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

async function copyGeneratedAssets() {
  await mkdir(distDir, { recursive: true });
  // The Handlebars shell is authored source; the JS/CSS come from fresh build output.
  await cp(viewerTemplatePath, path.join(distDir, 'index.html'));
  await rm(path.join(distDir, 'static'), { recursive: true, force: true });
  await cp(viewerBuildStaticDir, path.join(distDir, 'static'), { recursive: true });
}

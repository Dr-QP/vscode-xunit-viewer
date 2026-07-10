import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const bundlePath = path.join(distDir, 'extension.js');

// Source of truth: the vendored viewer package. Frontend assets are built from
// its React sources at build time rather than copied from checked-in output.
const viewerDir = path.join(rootDir, 'xunit-viewer');
const viewerCliDir = path.join(viewerDir, 'src', 'cli');
const viewerTemplatePath = path.join(viewerCliDir, 'index.html');
const viewerBuildDir = path.join(viewerDir, 'build');
const viewerBuildStaticDir = path.join(viewerBuildDir, 'static');
const viewerBuildStampPath = path.join(viewerBuildDir, '.build-stamp');
const reactScriptsBin = path.join(rootDir, 'node_modules', '.bin', 'react-scripts');

// Inputs that determine the frontend build output. Any change here invalidates
// the up-to-date guard and forces a fresh `react-scripts build`.
const viewerInputDirs = [
  path.join(viewerDir, 'src'),
  path.join(viewerDir, 'public'),
];
const viewerInputFiles = [
  path.join(viewerDir, 'package.json'),
  path.join(viewerDir, '.env'),
];
// Disable source maps for the vendored viewer: it is bundled into the webview
// and its maps are never shipped or consumed, so they are pure build cost.
const viewerBuildEnv = { CI: 'true', GENERATE_SOURCEMAP: 'false' };

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

async function buildViewerFrontend() {
  const inputHash = await computeViewerInputsHash();

  if (await isViewerBuildUpToDate(inputHash)) {
    console.log('[build] xunit-viewer frontend assets up to date, skipping build');
    return;
  }

  console.log('[build] building xunit-viewer frontend assets');
  const result = spawnSync(reactScriptsBin, ['build'], {
    cwd: viewerDir,
    stdio: 'inherit',
    env: { ...process.env, ...viewerBuildEnv },
  });

  if (result.error) {
    fail(`failed to run react-scripts build: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`react-scripts build exited with code ${result.status}`);
  }

  // Stamp the fresh build so the next run can skip when inputs are unchanged.
  await writeFile(viewerBuildStampPath, inputHash, 'utf8');
}

// The build is up to date when the emitted assets still exist and the stamp
// recorded for them matches the current inputs. The stamp lives inside `build/`,
// so removing the output directory also invalidates the guard.
async function isViewerBuildUpToDate(inputHash) {
  try {
    await stat(viewerBuildStaticDir);
    const stamped = await readFile(viewerBuildStampPath, 'utf8');
    return stamped === inputHash;
  } catch {
    return false;
  }
}

// Hash every input file's relative path and contents, plus the build env that
// affects output, into a single digest. Sorted paths keep the hash stable.
async function computeViewerInputsHash() {
  const files = [];
  for (const dir of viewerInputDirs) {
    files.push(...(await collectFiles(dir)));
  }
  files.push(...viewerInputFiles);
  files.sort();

  const hash = createHash('sha256');
  hash.update(JSON.stringify(viewerBuildEnv));
  for (const file of files) {
    hash.update(path.relative(viewerDir, file));
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
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

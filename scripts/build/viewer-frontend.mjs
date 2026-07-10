import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';

import {
  reactScriptsBin,
  viewerBuildStampPath,
  viewerBuildStaticDir,
  viewerDir,
} from './paths.mjs';
import { fail, log } from './log.mjs';

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

// Build the vendored viewer's React assets, skipping the (~40s) production
// build when its inputs are unchanged. `react-scripts build` has no up-to-date
// check of its own, so we guard it with a content stamp.
export async function buildViewerFrontend() {
  const inputHash = await computeViewerInputsHash();

  if (await isViewerBuildUpToDate(inputHash)) {
    log('xunit-viewer frontend assets up to date, skipping build');
    return;
  }

  log('building xunit-viewer frontend assets');
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

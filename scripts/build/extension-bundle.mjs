import { readFile, writeFile } from 'node:fs/promises';

import { bundlePath } from './paths.mjs';
import { fail } from './log.mjs';

const buildOptions = {
  entrypoints: ['./src/extension.ts'],
  outdir: './dist',
  target: 'node',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: 'linked',
};

// At runtime the bundled xunit-viewer resolves its render source relative to a
// hard-coded node_modules path baked in by esbuild. Rewrite it to the bundle's
// own location so the packaged extension can find it.
const renderSourcePathPattern =
  /__filename2 = import_url\.fileURLToPath\("file:\/\/[^"]*node_modules\/xunit-viewer\/src\/cli\/render\.js"\);/;

// Bundle the extension entrypoint with Bun.
export async function buildExtensionBundle() {
  const buildResult = await Bun.build(buildOptions);

  if (!buildResult.success) {
    for (const log of buildResult.logs) {
      console.error(log);
    }
    fail('bun build failed');
  }
}

// Patch the emitted bundle so the vendored viewer's render path points at the
// bundle itself rather than a node_modules path that won't exist when packaged.
export async function rewriteBundledRenderPath() {
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

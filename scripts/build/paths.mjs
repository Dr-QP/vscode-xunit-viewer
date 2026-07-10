import path from 'node:path';

// All build paths derive from the repo root. The build is always invoked from
// there (`bun run ./scripts/build.mjs`), so `process.cwd()` is the root.
export const rootDir = process.cwd();

export const distDir = path.join(rootDir, 'dist');
export const bundlePath = path.join(distDir, 'extension.js');

// Source of truth: the vendored viewer package. Frontend assets are built from
// its React sources at build time rather than copied from checked-in output.
export const viewerDir = path.join(rootDir, 'xunit-viewer');
export const viewerCliDir = path.join(viewerDir, 'src', 'cli');
export const viewerTemplatePath = path.join(viewerCliDir, 'index.html');
export const viewerBuildDir = path.join(viewerDir, 'build');
export const viewerBuildStaticDir = path.join(viewerBuildDir, 'static');
export const viewerBuildStampPath = path.join(viewerBuildDir, '.build-stamp');
export const reactScriptsBin = path.join(rootDir, 'node_modules', '.bin', 'react-scripts');

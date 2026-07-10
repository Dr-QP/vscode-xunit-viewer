import { log } from './build/log.mjs';
import { buildViewerFrontend } from './build/viewer-frontend.mjs';
import { buildExtensionBundle, rewriteBundledRenderPath } from './build/extension-bundle.mjs';
import { copyGeneratedAssets } from './build/assets.mjs';

// Orchestrates the extension build. Each step lives in its own module under
// ./build/, split by concern: the vendored viewer frontend, the extension
// bundle, and assembling dist/.
await main();

async function main() {
  await buildViewerFrontend();
  await buildExtensionBundle();
  await rewriteBundledRenderPath();
  await copyGeneratedAssets();
  log('bundle complete with freshly built xunit-viewer assets');
}

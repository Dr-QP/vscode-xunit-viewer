import path from 'node:path';
import { cp, mkdir, rm } from 'node:fs/promises';

import { distDir, viewerBuildStaticDir, viewerTemplatePath } from './paths.mjs';

// Assemble the extension's dist/ output from the freshly built viewer assets.
export async function copyGeneratedAssets() {
  await mkdir(distDir, { recursive: true });
  // The Handlebars shell is authored source; the JS/CSS come from fresh build output.
  await cp(viewerTemplatePath, path.join(distDir, 'index.html'));
  await rm(path.join(distDir, 'static'), { recursive: true, force: true });
  await cp(viewerBuildStaticDir, path.join(distDir, 'static'), { recursive: true });
}

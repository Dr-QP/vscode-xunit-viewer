import fs from 'fs'
import path from 'path'
import Handlebars from 'handlebars'
import LZUTF8 from 'lzutf8'

import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Frontend assets are produced by the build (no longer checked in). In the
// bundled extension they sit next to render.js under `dist/static`; for the
// standalone CLI they come from the fresh React build output under `build/static`.
const staticDirCandidates = [
  path.resolve(__dirname, './static'),
  path.resolve(__dirname, '../../build/static')
]
const staticDir = staticDirCandidates.find(dir => fs.existsSync(dir)) || staticDirCandidates[0]

const getHTML = (type) => {
  const dir = path.join(staticDir, type)
  return fs.readdirSync(dir)
    .filter(file => file.endsWith(`.${type}`) && !file.includes('runtime'))
    .map(file => fs.readFileSync(path.join(dir, file)).toString())
    .join('\n')
}

export default (logger, files, description, { title = 'Xunit Viewer', brand, favicon }) => {
  const scripts = getHTML('js')
  const styles = getHTML('css')

  const template = Handlebars.compile(fs.readFileSync(path.resolve(__dirname, 'index.html')).toString())

  files = files.map(({ file, contents }) => ({ file, contents: LZUTF8.compress(contents, { outputEncoding: 'Base64' }) }))

  return template({
    files: JSON.stringify(files),
    scripts,
    styles,
    title,
    icon: brand || 'https://lukejpreston.github.io/xunit-viewer/icon.png',
    favicon: favicon || 'https://lukejpreston.github.io/xunit-viewer/favicon.ico',
    brand,
    description
  })
}

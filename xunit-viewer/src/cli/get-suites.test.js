import fs from 'fs'
import path from 'path'
import getSuites from './get-suites'
import expected from './get-suites-expected.json'

const logger = {
  warning: input => input,
  file: input => input,
  error: input => input
}

// File discovery lives in the VS Code extension now, so read the sample data
// directly instead of the removed standalone CLI scanner.
const readXmlFiles = (folder, files = []) => {
  for (const name of fs.readdirSync(folder)) {
    const file = path.join(folder, name)
    if (fs.lstatSync(file).isDirectory()) readXmlFiles(file, files)
    else if (file.endsWith('.xml')) files.push({ file, contents: fs.readFileSync(file).toString() })
  }
  return files
}

test('get suites', async () => {
  const files = readXmlFiles(path.resolve(__dirname, '../../data'))
  const suites = await getSuites(logger, files)
  expect(suites).toEqual(expected)
})

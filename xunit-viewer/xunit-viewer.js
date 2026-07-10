import fs from 'fs'
import path from 'path'
import getDescription from './src/cli/get-description.js'
import getSuites from './src/cli/get-suites.js'
import Logger from './src/cli/logger.js'
import render from './src/cli/render.js'

// This package is consumed only by the VS Code extension. The extension owns
// file discovery and watching and passes an already-resolved file payload, so
// this entrypoint is a pure parse + render runtime with no filesystem scan,
// server, terminal, or watch modes.
export default async (args) => {
  const logger = Logger(args.noColor)

  const files = args.files
  const suites = await getSuites(logger, files)
  const description = getDescription(suites)
  const result = render(logger, files, description, args)

  const outputFile = path.resolve(process.cwd(), args.output)
  fs.writeFileSync(outputFile, result)
}

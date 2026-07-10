import fs from 'fs'
import debounce from 'debounce'

// Standalone CLI watch support only. The VS Code extension owns its own watch
// behaviour via `vscode.workspace.createFileSystemWatcher` and never uses this
// path, so a minimal Node `fs.watch` implementation replaces the former
// chokidar-based watcher (chokidar is no longer a dependency).
export default ({ results }, cb) => {
  const debounced = debounce(cb, 100)
  try {
    fs.watch(results, { recursive: true }, () => debounced())
  } catch (err) {
    // `recursive` is not supported on every platform; fall back to a flat watch.
    fs.watch(results, () => debounced())
  }
}

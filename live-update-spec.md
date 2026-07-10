# Live report updates (incremental, no full reload)

## Purpose

The standalone `xunit-viewer` CLI had a "server mode" that pushed test-result
changes into an already-open report and re-rendered it **in place**, without a
browser navigation/reload. The VS Code extension currently regenerates the whole
report HTML and reassigns `panel.webview.html` on every watcher event, which is a
**full reload**: the webview reloads all assets, React remounts, and all view
state (scroll position, filter toggles, expanded suites, find-widget state) is
lost.

This spec documents how the original socket update worked and specifies how to
re-implement the same "soft update" behavior on top of the VS Code webview
message channel instead of Socket.IO.

## Part 1 — How the original socket update worked

The report was always a React single-page app. "Live update" just meant pushing
a fresh file payload into that running app and letting React re-render. Socket.IO
was only the transport.

### Server side (removed `src/cli/server.js`)

```js
app.get('/', async (req, res) => {
  const files = await getFiles(logger, args)
  const suites = await getSuites(logger, files)
  const description = getDescription(suites)
  res.send(render(logger, files, description, args, true)) // useSockets = true
})

io.on('connection', function (socket) {
  watch(args, () => {
    socket.emit('update', { files: getFiles(logger, args) })
  })
})
```

1. The initial `GET /` rendered the report with `useSockets = true`. That flag
   made the HTML template (`src/cli/index.html`) include the Socket.IO client
   script:

   ```html
   {{#if useSockets}}
   <script src="/socket.io/socket.io.js"></script>
   {{/if}}
   ```

2. On each socket connection, the server started a filesystem watcher
   (`src/cli/watch.js`). Whenever a watched result file changed, it re-scanned
   the results directory and emitted an `update` event whose payload was
   `{ files }` — an array of `{ file, contents }` with **raw (uncompressed)** XML
   strings.

### Client side (`src/app/app.js`)

```js
const onUpdate = ({ files }) => {
  parseAll(dispatch, files, {})
}

window.sockets = window.sockets || null
useEffect(() => {
  if (window.sockets === null && 'io' in window) {
    window.sockets = window.io()
    window.sockets.on('update', onUpdate)
  }
})
```

1. If the Socket.IO client script had loaded (`'io' in window`), the app opened a
   socket and subscribed to `update`.
2. `onUpdate({ files })` called `parseAll(dispatch, files, {})`. `parseAll`
   parses every file's XML into suites and dispatches `parse-suites`, which
   replaces `state.suites` in the reducer.
3. React reconciles the DOM from the new suites. **No navigation, no reload, no
   asset re-fetch** — only the changed DOM nodes update.

### Content-encoding detail (important)

Two different encodings exist on the two paths, and the re-wiring must respect
this:

- **Initial embedded payload:** `render.js` compresses each file's contents with
  `LZUTF8` (Base64) into `window.files`; `src/index.js` decompresses them before
  handing them to `<App files=... />`.
- **Live update payload:** the socket sent **raw** contents, and `onUpdate` fed
  them straight to `parseAll`. So the update channel is expected to carry
  **uncompressed** XML strings.

### Known limitations of the original implementation

- `socket.emit('update', { files: getFiles(...) })` did **not** `await`
  `getFiles` (which is `async`), so `files` was actually a `Promise`. This path
  was effectively broken for the async file reader; the VS Code version reads
  files in the extension host and avoids this.
- Every change re-read and re-parsed **all** files, not just the changed one.
- `parseAll(dispatch, files, {})` re-parses with **default filters**, so a live
  update **resets view state** (filter toggles, expanded/collapsed suites). It
  avoids a browser reload but is not fully state-preserving.

## Part 2 — Target design in the VS Code extension

Replace Socket.IO with the webview message channel
(`webview.postMessage` ⇄ `acquireVsCodeApi().postMessage` / `window.message`).
Everything else (the React app's update handling) stays conceptually identical.

### Current extension flow (full reload)

`src/commands.ts` → `showReport()` runs on both first open and every watcher
event:

```
collectResultFiles → readResultFiles → generateReport (writes HTML) →
panel.webview.html = report.html   // ← full reload
```

`src/reportWatcher.ts` calls `onChange` → `regenerateReport` → `showReport`.

### Target flow

Split "first render" from "live update":

- **First open** (`openReport`, config change, explicit refresh command): keep
  the current path — generate full HTML and assign `panel.webview.html`. This
  establishes the SPA and writes the on-disk `outputPath` report.
- **Watcher-driven update**: do **not** reassign `panel.webview.html`. Instead:

  ```ts
  const resultFiles = await collectResultFiles(resultsUri, stat, ignorePatterns);
  const files = await readResultFiles(resultFiles); // { file, contents } uncompressed
  panel.webview.postMessage({ type: 'xunit:update', files });
  ```

  Optionally still regenerate the on-disk `outputPath` file in the background so
  an externally-opened report stays current, but the webview itself updates via
  the message only.

### Webview bridge (injected into the report shell)

The report template must adapt VS Code webview messages to the app's update
handler. Add a small bootstrap script to `xunit-viewer/src/cli/index.html`
(replacing the removed Socket.IO block) that is inert outside VS Code:

```html
<script>
  if (typeof acquireVsCodeApi === 'function') {
    // Retained so the extension can post future updates.
    window.__vscode = acquireVsCodeApi();
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg && msg.type === 'xunit:update') {
        window.dispatchEvent(
          new CustomEvent('xunit:update', { detail: { files: msg.files } })
        );
      }
    });
  }
</script>
```

### App-side subscription (transport-agnostic)

Generalize `src/app/app.js` so it no longer knows about Socket.IO. Subscribe to a
DOM `CustomEvent` instead of a socket:

```js
useEffect(() => {
  const handler = (event) => onUpdate(event.detail); // { files }
  window.addEventListener('xunit:update', handler);
  return () => window.removeEventListener('xunit:update', handler);
}, []);
```

`onUpdate` keeps calling `parseAll(dispatch, files, ...)`. Because the extension
sends **uncompressed** contents (matching the original socket payload), no
decompression is needed on the update path.

### CSP / webview options

- The panel already uses `enableScripts: true` and
  `retainContextWhenHidden: true` (`src/panel.ts`), so posted messages survive
  the panel being hidden.
- If a Content-Security-Policy `<meta>` is added to the shell, it must allow the
  inline bootstrap script (e.g. a nonce) and must not block
  `acquireVsCodeApi()`.
- `postMessage` payloads are structured-cloned; keep `files` as plain
  `{ file, contents }` objects.

## Part 3 — Optional enhancement: preserve view state

The original update reset filters and suite expansion. To make live updates fully
seamless in the extension:

- Change `onUpdate` to merge new suites into existing view state instead of
  re-parsing with default filters — pass the current filter set and reconcile
  `currentSuites` so expanded/collapsed and filter toggles are retained across an
  update.
- Alternatively, snapshot the relevant reducer view state before `parse-suites`
  and re-apply it after. This is a follow-up; the base spec (Parts 1–2) already
  removes the full webview reload.

## Acceptance criteria

- Opening a report performs one full render (`panel.webview.html`).
- A subsequent change to an included XML file updates the report **without**
  reassigning `panel.webview.html` — verified by the webview not reloading its
  assets (no flash, React does not remount, scroll position is retained modulo
  the Part 3 enhancement).
- Modifying an ignored or non-XML file posts no update (same filter path as
  discovery, already enforced by `reportWatcher.ts`).
- Closing the panel disposes the watcher; no messages are posted afterward.
- The report shell works unchanged outside VS Code (the bootstrap script is inert
  when `acquireVsCodeApi` is absent).

## Files expected to change

- Extension:
  - `src/commands.ts` — split first-render vs. watcher-driven update; post
    `xunit:update` messages instead of reassigning `webview.html`.
  - `src/reportGenerator.ts` — optionally expose a "collect + read files only"
    path for updates (reuse `collectResultFiles` / `readResultFiles`).
  - `src/panel.ts` — expose the panel so `postMessage` can be called on updates.
- Vendored viewer:
  - `xunit-viewer/src/cli/index.html` — replace the removed Socket.IO block with
    the VS Code webview bootstrap script.
  - `xunit-viewer/src/app/app.js` — subscribe to the `xunit:update` CustomEvent
    instead of a Socket.IO `update` event.

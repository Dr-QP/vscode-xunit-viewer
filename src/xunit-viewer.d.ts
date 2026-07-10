declare module 'xunit-viewer' {
  export interface XunitViewerFile {
    file: string;
    contents: string;
  }

  export interface XunitViewerOptions {
    /**
     * Pre-resolved file payloads gathered by the extension. When provided the
     * renderer skips its own filesystem scan (`results`/`ignore` are ignored).
     */
    files?: XunitViewerFile[];
    /** Root path scanned in standalone CLI mode when `files` is not supplied. */
    results?: string;
    /** Ignore patterns applied by the CLI-mode scan only. */
    ignore?: string[];
    output: string;
    title: string;
    server: boolean;
    script: boolean;
  }

  export type XunitViewer = (options: XunitViewerOptions) => Promise<void>;

  const xunitViewer: XunitViewer;
  export default xunitViewer;
}

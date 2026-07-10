declare module 'xunit-viewer' {
  export interface XunitViewerFile {
    file: string;
    contents: string;
  }

  export interface XunitViewerOptions {
    /** Pre-resolved file payloads gathered by the extension. */
    files: XunitViewerFile[];
    /** Path where the generated HTML report is written. */
    output: string;
    /** Report title. */
    title: string;
  }

  export type XunitViewer = (options: XunitViewerOptions) => Promise<void>;

  const xunitViewer: XunitViewer;
  export default xunitViewer;
}

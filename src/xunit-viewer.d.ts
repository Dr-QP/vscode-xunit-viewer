declare module 'xunit-viewer' {
  export interface XunitViewerOptions {
    results: string;
    output: string;
    title: string;
    ignore: string[];
    server: boolean;
    script: boolean;
  }

  export type XunitViewer = (options: XunitViewerOptions) => Promise<void>;

  const xunitViewer: XunitViewer;
  export default xunitViewer;
}

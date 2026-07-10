import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

type Extension = typeof import('../src/extension');

const FILE_TYPE = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 };

function createConfiguration(values: Record<string, unknown> = {}) {
  return {
    get(key: string, fallbackValue: unknown) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallbackValue;
    },
  };
}

interface FakeUri {
  fsPath: string;
}

class Uri implements FakeUri {
  constructor(public fsPath: string) {}
  static file(fsPath: string): Uri {
    return new Uri(fsPath);
  }
}

class RelativePattern {
  public baseUri: FakeUri;
  constructor(
    base: FakeUri | string,
    public pattern: string,
  ) {
    this.baseUri = typeof base === 'string' ? { fsPath: base } : base;
  }
}

interface WatcherHandlers {
  create: Array<(uri: FakeUri) => void>;
  change: Array<(uri: FakeUri) => void>;
  delete: Array<(uri: FakeUri) => void>;
}

interface CapturedWatcher {
  pattern: RelativePattern;
  handlers: WatcherHandlers;
  dispose: jest.Mock;
}

interface VscodeMockOptions {
  workspaceFolders?: unknown[];
  configuration?: Record<string, unknown>;
  findFiles?: (pattern: RelativePattern) => Promise<FakeUri[]>;
  statFor?: (fsPath: string) => { type: number } | undefined;
  readFileContents?: (fsPath: string) => string;
}

interface VscodeMockHandles {
  mock: Record<string, unknown>;
  panel: {
    title: string;
    webview: { html: string };
    reveal: jest.Mock;
    onDidDispose: jest.Mock;
    dispose: () => void;
  };
  commandHandlers: Record<string, (...args: unknown[]) => Promise<void>>;
  getConfigurationChangeHandler: () => ((event: unknown) => Promise<void>) | undefined;
  watchers: CapturedWatcher[];
  windowMock: Record<string, jest.Mock>;
}

function createVscodeMock(options: VscodeMockOptions = {}): VscodeMockHandles {
  const commandHandlers: Record<string, (...args: unknown[]) => Promise<void>> = {};
  const watchers: CapturedWatcher[] = [];
  let configurationChangeHandler: ((event: unknown) => Promise<void>) | undefined;
  let panelDisposeHandler: (() => void) | undefined;

  const panel = {
    title: '',
    webview: { html: '' },
    reveal: jest.fn(),
    onDidDispose: jest.fn((handler: unknown) => {
      panelDisposeHandler = handler as () => void;
      return { dispose: jest.fn() };
    }),
    dispose: (): void => {
      panelDisposeHandler?.();
    },
  };

  const statFor = options.statFor ?? (() => ({ type: FILE_TYPE.Directory }));
  const readFileContents = options.readFileContents ?? (() => '<testsuite name="x" />');

  const windowMock = {
    createWebviewPanel: jest.fn(() => panel),
    setStatusBarMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showWorkspaceFolderPick: jest.fn(),
  };

  const mock = {
    Uri,
    RelativePattern,
    FileType: FILE_TYPE,
    ViewColumn: { One: 1 },
    workspace: {
      workspaceFolders: options.workspaceFolders,
      getWorkspaceFolder: jest.fn(() => (options.workspaceFolders ?? [])[0]),
      onDidChangeConfiguration: jest.fn((handler: (event: unknown) => Promise<void>) => {
        configurationChangeHandler = handler;
        return { dispose: jest.fn() };
      }),
      findFiles: jest.fn(options.findFiles ?? (async () => [])),
      createFileSystemWatcher: jest.fn((pattern: RelativePattern) => {
        const handlers: WatcherHandlers = { create: [], change: [], delete: [] };
        const register = (bucket: Array<(uri: FakeUri) => void>) => (handler: (uri: FakeUri) => void) => {
          bucket.push(handler);
          return { dispose: jest.fn() };
        };
        const captured: CapturedWatcher = { pattern, handlers, dispose: jest.fn() };
        watchers.push(captured);
        return {
          onDidCreate: jest.fn(register(handlers.create)),
          onDidChange: jest.fn(register(handlers.change)),
          onDidDelete: jest.fn(register(handlers.delete)),
          dispose: captured.dispose,
        };
      }),
      getConfiguration: jest.fn(() => createConfiguration(options.configuration ?? {})),
      fs: {
        stat: jest.fn(async (uri: FakeUri) => {
          const result = statFor(uri.fsPath);
          if (!result) {
            throw new Error(`ENOENT: ${uri.fsPath}`);
          }
          return result;
        }),
        readFile: jest.fn(async (uri: FakeUri) => Buffer.from(readFileContents(uri.fsPath), 'utf8')),
      },
    },
    window: windowMock,
    commands: {
      registerCommand: jest.fn((commandId: string, handler: (...args: unknown[]) => Promise<void>) => {
        commandHandlers[commandId] = handler;
        return { dispose: jest.fn() };
      }),
    },
  };

  return {
    mock,
    panel,
    commandHandlers,
    getConfigurationChangeHandler: () => configurationChangeHandler,
    watchers,
    windowMock,
  };
}

interface LoadExtensionOptions {
  vscodeMock?: unknown;
  xunitViewerMock?: unknown;
}

function loadExtension({ vscodeMock, xunitViewerMock }: LoadExtensionOptions = {}): Extension {
  jest.resetModules();

  if (vscodeMock) {
    jest.doMock('vscode', () => vscodeMock, { virtual: true });
  }

  if (xunitViewerMock) {
    jest.doMock('xunit-viewer', () => xunitViewerMock);
  }

  return require('../src/extension') as Extension;
}

function loadModule<T>(vscodeMock: unknown, moduleId: string): T {
  jest.resetModules();
  jest.doMock('vscode', () => vscodeMock, { virtual: true });
  return require(moduleId) as T;
}

describe('vscode-xunit-viewer extension', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.useRealTimers();
  });

  test('buildReportOptions resolves workspace-relative settings', () => {
    const workspaceFolder = {
      name: 'demo-workspace',
      uri: { fsPath: '/tmp/demo-workspace' },
    };
    const { mock } = createVscodeMock({
      configuration: {
        resultsPath: 'custom-results',
        outputPath: 'reports/output.html',
        title: '   ',
        ignorePatterns: ['ignored.xml'],
      },
    });

    const extension = loadExtension({ vscodeMock: mock });
    const options = extension.buildReportOptions(workspaceFolder as never);

    expect((mock.workspace as { getConfiguration: jest.Mock }).getConfiguration).toHaveBeenCalledWith(
      'vscode-xunit-viewer',
      workspaceFolder,
    );
    expect(options).toEqual({
      workspaceFolder,
      resultsPath: path.join('/tmp/demo-workspace', 'custom-results'),
      outputPath: path.join('/tmp/demo-workspace', 'reports/output.html'),
      title: 'demo-workspace XUnit Test Results',
      ignorePatterns: ['ignored.xml'],
    });
  });

  test('generateReport passes resolved file payloads to the xunit-viewer adapter', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xunit-viewer-report-'));
    const outputPath = path.join(tempDir, 'nested', 'fixture-report.html');
    interface XunitViewerArgs {
      files: Array<{ file: string; contents: string }>;
      output: string;
      title: string;
      results?: string;
      ignore?: string[];
      server: boolean;
      script: boolean;
    }
    const xunitViewerMock = jest.fn(async ({ files, output, title, results, ignore, server, script }: XunitViewerArgs) => {
      expect(files).toEqual([{ file: '/results/results.xml', contents: '<testsuite />' }]);
      expect(results).toBeUndefined();
      expect(ignore).toBeUndefined();
      expect(server).toBe(false);
      expect(script).toBe(true);

      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, `<html><body><h1>${title}</h1></body></html>`, 'utf8');
    });
    const extension = loadExtension({ xunitViewerMock });

    const report = await extension.generateReport({
      files: [{ file: '/results/results.xml', contents: '<testsuite />' }],
      outputPath,
      title: 'Fixture Results',
    });

    const html = await fs.readFile(outputPath, 'utf8');

    expect(xunitViewerMock).toHaveBeenCalledTimes(1);
    expect(report.outputPath).toBe(outputPath);
    expect(report.html).toContain('Fixture Results');
    expect(html).toContain('<h1>Fixture Results</h1>');
  });

  test('collectResultFiles excludes basename and nested-glob ignores relative to resultsPath', async () => {
    const resultsUri = { fsPath: path.join('/ws', 'build') };
    const candidatePaths = [
      path.join('/ws', 'build', 'a', 'results.xml'),
      path.join('/ws', 'build', 'package.xml'),
      path.join('/ws', 'build', 'nested', 'package.xml'),
      path.join('/ws', 'build', 'coverage', 'report.xml'),
      path.join('/ws', 'build', 'testing', 'deep', 'x.xml'),
      path.join('/ws', 'build', 'keep.xml'),
    ];
    const { mock } = createVscodeMock({
      findFiles: async () => candidatePaths.map((fsPath) => ({ fsPath })),
    });
    const { collectResultFiles } = loadModule<typeof import('../src/resultFiles')>(mock, '../src/resultFiles');

    const result = await collectResultFiles(
      resultsUri as never,
      { type: FILE_TYPE.Directory } as never,
      ['package.xml', '**/coverage/*.xml', '**/testing/**'],
    );

    expect(result.map((uri) => uri.fsPath)).toEqual([
      path.join('/ws', 'build', 'a', 'results.xml'),
      path.join('/ws', 'build', 'keep.xml'),
    ]);
  });

  test('collectResultFiles returns a single configured file path verbatim', async () => {
    const resultsUri = { fsPath: path.join('/ws', 'build', 'only.xml') };
    const { mock } = createVscodeMock();
    const resultFiles = loadModule<typeof import('../src/resultFiles')>(mock, '../src/resultFiles');

    const result = await resultFiles.collectResultFiles(
      resultsUri as never,
      { type: FILE_TYPE.File } as never,
      ['package.xml'],
    );

    expect(result).toEqual([resultsUri]);
    expect((mock.workspace as { findFiles: jest.Mock }).findFiles).not.toHaveBeenCalled();
  });

  test('createReportWatcher debounces refreshes and skips ignored/non-xml events', () => {
    jest.useFakeTimers();
    const resultsUri = { fsPath: path.join('/ws', 'build') };
    const { mock, watchers } = createVscodeMock();
    const { createReportWatcher } = loadModule<typeof import('../src/reportWatcher')>(mock, '../src/reportWatcher');

    const onChange = jest.fn();
    const watcher = createReportWatcher({
      resultsUri: resultsUri as never,
      stat: { type: FILE_TYPE.Directory } as never,
      ignorePatterns: ['package.xml'],
      onChange,
      debounceMs: 100,
    });

    expect(mock.workspace).toBeDefined();
    expect((mock.workspace as { createFileSystemWatcher: jest.Mock }).createFileSystemWatcher).toHaveBeenCalledTimes(1);
    const captured = watchers[0]!;
    const fire = (fsPath: string) => captured.handlers.create.forEach((handler) => handler({ fsPath }));

    // A burst of included writes collapses into one refresh.
    fire(path.join('/ws', 'build', 'a.xml'));
    fire(path.join('/ws', 'build', 'b.xml'));
    jest.advanceTimersByTime(100);
    expect(onChange).toHaveBeenCalledTimes(1);

    // Ignored and non-xml events do not schedule a refresh.
    fire(path.join('/ws', 'build', 'package.xml'));
    fire(path.join('/ws', 'build', 'notes.txt'));
    jest.advanceTimersByTime(100);
    expect(onChange).toHaveBeenCalledTimes(1);

    watcher.dispose();
    expect(captured.dispose).toHaveBeenCalledTimes(1);
  });

  test('activate registers commands, wires a watcher, and refresh reuses the panel context', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xunit-viewer-command-'));
    const resultsPath = path.join(tempDir, 'build');
    const workspaceFolder = {
      name: 'demo-workspace',
      uri: { fsPath: tempDir },
    };
    const xunitViewerMock = jest.fn(async ({ output, title }: { output: string; title: string }) => {
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, `<html><body><h1>${title}</h1></body></html>`, 'utf8');
    });
    const handles = createVscodeMock({
      workspaceFolders: [workspaceFolder],
      configuration: {
        resultsPath,
        outputPath: path.join(tempDir, 'reports', 'output.html'),
        title: 'Workspace Report',
        ignorePatterns: ['package.xml'],
      },
      findFiles: async () => [{ fsPath: path.join(resultsPath, 'results.xml') }],
    });

    const extension = loadExtension({ vscodeMock: handles.mock, xunitViewerMock });
    const context = { subscriptions: [] };

    extension.activate(context as never);
    await handles.commandHandlers['vscode-xunit-viewer.openReport']!(workspaceFolder.uri);
    await handles.commandHandlers['vscode-xunit-viewer.refreshReport']!();

    expect(context.subscriptions).toHaveLength(3);
    expect((handles.mock.commands as { registerCommand: jest.Mock }).registerCommand).toHaveBeenCalledTimes(2);
    expect(handles.windowMock.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(handles.panel.webview.html).toContain('Workspace Report');
    expect(handles.panel.reveal).toHaveBeenCalledTimes(2);
    expect(xunitViewerMock).toHaveBeenCalledTimes(2);
    // Each render replaces the watcher; the previous one is disposed.
    expect(handles.watchers).toHaveLength(2);
    expect(handles.watchers[0]!.dispose).toHaveBeenCalledTimes(1);

    const configurationChangeHandler = handles.getConfigurationChangeHandler()!;
    const unrelatedChange = { affectsConfiguration: jest.fn((_section: string, _scope?: unknown) => false) };
    await configurationChangeHandler(unrelatedChange);
    expect(unrelatedChange.affectsConfiguration).toHaveBeenCalledWith('vscode-xunit-viewer', workspaceFolder.uri);
    expect(xunitViewerMock).toHaveBeenCalledTimes(2);

    await configurationChangeHandler({ affectsConfiguration: jest.fn(() => true) });
    expect(xunitViewerMock).toHaveBeenCalledTimes(3);
    expect(handles.panel.reveal).toHaveBeenCalledTimes(3);

    const normalizedStatusBarCalls = handles.windowMock.setStatusBarMessage!.mock.calls.map(
      ([message, duration]) => [(message as string).replaceAll('\\', '/'), duration],
    );
    expect(normalizedStatusBarCalls).toContainEqual([
      'XUnit Viewer refreshed reports/output.html',
      4000,
    ]);

    // Closing the panel disposes the active watcher.
    const activeWatcher = handles.watchers[handles.watchers.length - 1]!;
    handles.panel.dispose();
    expect(activeWatcher.dispose).toHaveBeenCalledTimes(1);

    extension.deactivate();
  });

  test('refresh command shows guidance when no report has been opened', async () => {
    const { mock, commandHandlers, getConfigurationChangeHandler, windowMock } = createVscodeMock({
      workspaceFolders: [],
    });

    const extension = loadExtension({ vscodeMock: mock });
    extension.activate({ subscriptions: [] } as never);

    await commandHandlers['vscode-xunit-viewer.refreshReport']!();

    expect(windowMock.showInformationMessage).toHaveBeenCalledWith('Open XUnit test results first.');

    const configurationChange = { affectsConfiguration: jest.fn(() => true) };
    await getConfigurationChangeHandler()!(configurationChange);
    expect(configurationChange.affectsConfiguration).not.toHaveBeenCalled();

    extension.deactivate();
  });

  test('openReport shows a friendly error when results path has no usable xunit XML files', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xunit-viewer-empty-'));
    const workspaceFolder = {
      name: 'demo-workspace',
      uri: { fsPath: tempDir },
    };
    const emptyResultsPath = path.join(tempDir, 'empty-results');
    const xunitViewerMock = jest.fn();

    const handles = createVscodeMock({
      workspaceFolders: [workspaceFolder],
      configuration: {
        resultsPath: emptyResultsPath,
        outputPath: path.join(tempDir, 'reports', 'output.html'),
        title: '',
        ignorePatterns: ['package.xml'],
      },
      findFiles: async () => [],
    });

    const extension = loadExtension({ vscodeMock: handles.mock, xunitViewerMock });
    extension.activate({ subscriptions: [] } as never);

    await handles.commandHandlers['vscode-xunit-viewer.openReport']!(workspaceFolder.uri);

    expect(xunitViewerMock).not.toHaveBeenCalled();
    expect(handles.windowMock.createWebviewPanel).not.toHaveBeenCalled();
    expect(handles.windowMock.setStatusBarMessage).not.toHaveBeenCalled();
    expect(handles.windowMock.showErrorMessage).toHaveBeenCalledWith(
      `XUnit Viewer failed: No usable xUnit XML files were found in ${emptyResultsPath}. Run colcon tests first or update vscode-xunit-viewer.resultsPath or vscode-xunit-viewer.ignorePatterns.`,
    );

    extension.deactivate();
  });

  test('openReport surfaces a friendly error when the results path is missing', async () => {
    const workspaceFolder = {
      name: 'demo-workspace',
      uri: { fsPath: '/ws' },
    };
    const missingResultsPath = path.join('/ws', 'does-not-exist');
    const handles = createVscodeMock({
      workspaceFolders: [workspaceFolder],
      configuration: {
        resultsPath: missingResultsPath,
        outputPath: path.join('/ws', 'reports', 'output.html'),
        title: '',
        ignorePatterns: [],
      },
      statFor: () => undefined,
    });

    const extension = loadExtension({ vscodeMock: handles.mock });
    extension.activate({ subscriptions: [] } as never);

    await handles.commandHandlers['vscode-xunit-viewer.openReport']!(workspaceFolder.uri);

    expect(handles.windowMock.showErrorMessage).toHaveBeenCalledWith(
      `XUnit Viewer failed: Results path does not exist: ${missingResultsPath}. Run colcon tests first or update vscode-xunit-viewer.resultsPath.`,
    );

    extension.deactivate();
  });
});

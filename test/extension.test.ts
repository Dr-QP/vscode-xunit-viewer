import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

type Extension = typeof import('../src/extension');

function createConfiguration(values: Record<string, unknown> = {}) {
  return {
    get(key: string, fallbackValue: unknown) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallbackValue;
    },
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

describe('vscode-xunit-viewer extension', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('buildReportOptions resolves workspace-relative settings', () => {
    const workspaceFolder = {
      name: 'demo-workspace',
      uri: { fsPath: '/tmp/demo-workspace' },
    };
    const vscodeMock = {
      workspace: {
        getConfiguration: jest.fn((_section: string, _scope: unknown) =>
          createConfiguration({
            resultsPath: 'custom-results',
            outputPath: 'reports/output.html',
            title: '   ',
            ignorePatterns: ['ignored.xml'],
          }),
        ),
      },
    };

    const extension = loadExtension({ vscodeMock });
    const options = extension.buildReportOptions(workspaceFolder as never);

    expect(vscodeMock.workspace.getConfiguration).toHaveBeenCalledWith('vscode-xunit-viewer', workspaceFolder);
    expect(options).toEqual({
      workspaceFolder,
      resultsPath: path.join('/tmp/demo-workspace', 'custom-results'),
      outputPath: path.join('/tmp/demo-workspace', 'reports/output.html'),
      title: 'demo-workspace XUnit Test Results',
      ignorePatterns: ['ignored.xml'],
    });
  });

  test('generateReport writes HTML output using the xunit-viewer adapter', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xunit-viewer-report-'));
    const outputPath = path.join(tempDir, 'nested', 'fixture-report.html');
    interface XunitViewerArgs {
      results: string;
      output: string;
      title: string;
      ignore: string[];
      server: boolean;
      script: boolean;
    }
    const xunitViewerMock = jest.fn(async ({ results, output, title, ignore, server, script }: XunitViewerArgs) => {
      expect(results).toBe(path.join(__dirname, 'fixtures'));
      expect(ignore).toEqual(['package.xml']);
      expect(server).toBe(false);
      expect(script).toBe(true);

      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, `<html><body><h1>${title}</h1></body></html>`, 'utf8');
    });
    const extension = loadExtension({ xunitViewerMock });

    const report = await extension.generateReport({
      resultsPath: path.join(__dirname, 'fixtures'),
      outputPath,
      title: 'Fixture Results',
      ignorePatterns: ['package.xml'],
    });

    const html = await fs.readFile(outputPath, 'utf8');

    expect(xunitViewerMock).toHaveBeenCalledTimes(1);
    expect(report.outputPath).toBe(outputPath);
    expect(report.html).toContain('Fixture Results');
    expect(html).toContain('Fixture Results');
    expect(html).toContain('<h1>Fixture Results</h1>');
  });

  test('activate registers commands and refresh reuses the existing panel context', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xunit-viewer-command-'));
    const workspaceFolder = {
      name: 'demo-workspace',
      uri: { fsPath: tempDir },
    };
    const panel = {
      title: '',
      webview: { html: '' },
      reveal: jest.fn(),
      onDidDispose: jest.fn(),
    };
    const commandHandlers: Record<string, (...args: unknown[]) => Promise<void>> = {};
    let configurationChangeHandler: ((event: unknown) => Promise<void>) | undefined;
    const xunitViewerMock = jest.fn(async ({ output, title }: { output: string; title: string }) => {
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, `<html><body><h1>${title}</h1></body></html>`, 'utf8');
    });
    const vscodeMock = {
      Uri: class Uri {},
      RelativePattern: class RelativePattern {
        constructor(
          public base: string,
          public pattern: string,
        ) {}
      },
      ViewColumn: { One: 1 },
      workspace: {
        workspaceFolders: [workspaceFolder],
        getWorkspaceFolder: jest.fn(() => workspaceFolder),
        onDidChangeConfiguration: jest.fn((handler: (event: unknown) => Promise<void>) => {
          configurationChangeHandler = handler;
          return { dispose: jest.fn() };
        }),
        findFiles: jest.fn(async () => [
          { fsPath: path.join(__dirname, 'fixtures', 'results.xml') },
        ]),
        getConfiguration: jest.fn(() =>
          createConfiguration({
            resultsPath: path.join(__dirname, 'fixtures'),
            outputPath: path.join(tempDir, 'reports', 'output.html'),
            title: 'Workspace Report',
            ignorePatterns: ['package.xml'],
          }),
        ),
      },
      window: {
        createWebviewPanel: jest.fn(() => panel),
        setStatusBarMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showWorkspaceFolderPick: jest.fn(),
      },
      commands: {
        registerCommand: jest.fn((commandId: string, handler: (...args: unknown[]) => Promise<void>) => {
          commandHandlers[commandId] = handler;
          return { dispose: jest.fn() };
        }),
      },
    };

    const extension = loadExtension({ vscodeMock, xunitViewerMock });
    const context = { subscriptions: [] };

    extension.activate(context as never);
    await commandHandlers['vscode-xunit-viewer.openReport']!(workspaceFolder.uri);
    await commandHandlers['vscode-xunit-viewer.refreshReport']!();

    expect(context.subscriptions).toHaveLength(3);
    expect(vscodeMock.commands.registerCommand).toHaveBeenCalledTimes(2);
    expect(vscodeMock.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(panel.webview.html).toContain('Workspace Report');
    expect(panel.reveal).toHaveBeenCalledTimes(2);
    expect(xunitViewerMock).toHaveBeenCalledTimes(2);

    const unrelatedChange = { affectsConfiguration: jest.fn((_section: string, _scope?: unknown) => false) };
    await configurationChangeHandler!(unrelatedChange);
    expect(unrelatedChange.affectsConfiguration).toHaveBeenCalledWith('vscode-xunit-viewer', workspaceFolder.uri);
    expect(xunitViewerMock).toHaveBeenCalledTimes(2);

    await configurationChangeHandler!({ affectsConfiguration: jest.fn(() => true) });
    expect(xunitViewerMock).toHaveBeenCalledTimes(3);
    expect(panel.reveal).toHaveBeenCalledTimes(3);
    const normalizedStatusBarCalls = vscodeMock.window.setStatusBarMessage.mock.calls.map(
      ([message, duration]) => [(message as string).replaceAll('\\', '/'), duration],
    );

    expect(normalizedStatusBarCalls).toContainEqual([
      'XUnit Viewer refreshed reports/output.html',
      4000,
    ]);

    extension.deactivate();
  });

  test('refresh command shows guidance when no report has been opened', async () => {
    const commandHandlers: Record<string, (...args: unknown[]) => Promise<void>> = {};
    let configurationChangeHandler: ((event: unknown) => Promise<void>) | undefined;
    const vscodeMock = {
      workspace: {
        workspaceFolders: [],
        onDidChangeConfiguration: jest.fn((handler: (event: unknown) => Promise<void>) => {
          configurationChangeHandler = handler;
          return { dispose: jest.fn() };
        }),
      },
      window: {
        showInformationMessage: jest.fn(),
      },
      commands: {
        registerCommand: jest.fn((commandId: string, handler: (...args: unknown[]) => Promise<void>) => {
          commandHandlers[commandId] = handler;
          return { dispose: jest.fn() };
        }),
      },
    };

    const extension = loadExtension({ vscodeMock });
    extension.activate({ subscriptions: [] } as never);

    await commandHandlers['vscode-xunit-viewer.refreshReport']!();

    expect(vscodeMock.window.showInformationMessage).toHaveBeenCalledWith('Open XUnit test results first.');

    const configurationChange = { affectsConfiguration: jest.fn(() => true) };
    await configurationChangeHandler!(configurationChange);
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
    const ignoredXmlPath = path.join(emptyResultsPath, 'package.xml');
    const commandHandlers: Record<string, (...args: unknown[]) => Promise<void>> = {};
    const xunitViewerMock = jest.fn();

    await fs.mkdir(emptyResultsPath, { recursive: true });
    await fs.writeFile(ignoredXmlPath, '<package />', 'utf8');

    const vscodeMock = {
      Uri: class Uri {},
      RelativePattern: class RelativePattern {
        constructor(
          public base: string,
          public pattern: string,
        ) {}
      },
      ViewColumn: { One: 1 },
      workspace: {
        workspaceFolders: [workspaceFolder],
        getWorkspaceFolder: jest.fn(() => workspaceFolder),
        onDidChangeConfiguration: jest.fn(() => ({ dispose: jest.fn() })),
        findFiles: jest.fn(async () => []),
        getConfiguration: jest.fn(() =>
          createConfiguration({
            resultsPath: emptyResultsPath,
            outputPath: path.join(tempDir, 'reports', 'output.html'),
            title: '',
            ignorePatterns: ['package.xml'],
          }),
        ),
      },
      window: {
        createWebviewPanel: jest.fn(),
        setStatusBarMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showWorkspaceFolderPick: jest.fn(),
      },
      commands: {
        registerCommand: jest.fn((commandId: string, handler: (...args: unknown[]) => Promise<void>) => {
          commandHandlers[commandId] = handler;
          return { dispose: jest.fn() };
        }),
      },
    };

    const extension = loadExtension({ vscodeMock, xunitViewerMock });
    extension.activate({ subscriptions: [] } as never);

    await commandHandlers['vscode-xunit-viewer.openReport']!(workspaceFolder.uri);

    expect(xunitViewerMock).not.toHaveBeenCalled();
    expect(vscodeMock.window.createWebviewPanel).not.toHaveBeenCalled();
    expect(vscodeMock.window.setStatusBarMessage).not.toHaveBeenCalled();
    expect(vscodeMock.window.showErrorMessage).toHaveBeenCalledWith(
      `XUnit Viewer failed: No usable xUnit XML files were found in ${emptyResultsPath}. Run colcon tests first or update vscode-xunit-viewer.resultsPath or vscode-xunit-viewer.ignorePatterns.`,
    );

    extension.deactivate();
  });
});

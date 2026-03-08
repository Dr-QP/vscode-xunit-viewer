const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function createConfiguration(values = {}) {
  return {
    get(key, fallbackValue) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallbackValue;
    },
  };
}

function loadExtension({ vscodeMock, xunitViewerMock } = {}) {
  jest.resetModules();

  if (vscodeMock) {
    jest.doMock('vscode', () => vscodeMock, { virtual: true });
  }

  if (xunitViewerMock) {
    jest.doMock('xunit-viewer', () => xunitViewerMock);
  }

  return require('../src/extension.js');
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
        getConfiguration: jest.fn(() =>
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
    const options = extension.buildReportOptions(workspaceFolder);

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
    const xunitViewerMock = jest.fn(async ({ results, output, title, ignore, server, script }) => {
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
    const commandHandlers = {};
    const xunitViewerMock = jest.fn(async ({ output, title }) => {
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, `<html><body><h1>${title}</h1></body></html>`, 'utf8');
    });
    const vscodeMock = {
      Uri: class Uri {},
      ViewColumn: { One: 1 },
      workspace: {
        workspaceFolders: [workspaceFolder],
        getWorkspaceFolder: jest.fn(() => workspaceFolder),
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
        registerCommand: jest.fn((commandId, handler) => {
          commandHandlers[commandId] = handler;
          return { dispose: jest.fn() };
        }),
      },
    };

    const extension = loadExtension({ vscodeMock, xunitViewerMock });
    const context = { subscriptions: [] };

    extension.activate(context);
    await commandHandlers['vscode-xunit-viewer.openReport'](workspaceFolder.uri);
    await commandHandlers['vscode-xunit-viewer.refreshReport']();

    expect(context.subscriptions).toHaveLength(2);
    expect(vscodeMock.commands.registerCommand).toHaveBeenCalledTimes(2);
    expect(vscodeMock.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(panel.webview.html).toContain('Workspace Report');
    expect(panel.reveal).toHaveBeenCalledTimes(2);
    expect(xunitViewerMock).toHaveBeenCalledTimes(2);
    const normalizedStatusBarCalls = vscodeMock.window.setStatusBarMessage.mock.calls.map(
      ([message, duration]) => [message.replaceAll('\\', '/'), duration],
    );

    expect(normalizedStatusBarCalls).toContainEqual([
      'XUnit Viewer refreshed reports/output.html',
      4000,
    ]);

    extension.deactivate();
  });

  test('refresh command shows guidance when no report has been opened', async () => {
    const commandHandlers = {};
    const vscodeMock = {
      workspace: {
        workspaceFolders: [],
      },
      window: {
        showInformationMessage: jest.fn(),
      },
      commands: {
        registerCommand: jest.fn((commandId, handler) => {
          commandHandlers[commandId] = handler;
          return { dispose: jest.fn() };
        }),
      },
    };

    const extension = loadExtension({ vscodeMock });
    extension.activate({ subscriptions: [] });

    await commandHandlers['vscode-xunit-viewer.refreshReport']();

    expect(vscodeMock.window.showInformationMessage).toHaveBeenCalledWith('Open XUnit test results first.');

    extension.deactivate();
  });
});

import type * as vscode from 'vscode';

export type VscodeApi = typeof vscode;

export function getVscode(): VscodeApi {
  // Delay loading the VS Code host module so Node-side tests can import this file.
  return require('vscode') as VscodeApi;
}

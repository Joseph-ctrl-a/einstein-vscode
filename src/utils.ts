import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { C } from './colors'

export const Str = {
  longestCommonPrefix: (strs: string[]): string =>
    strs.reduce((prefix, str) => {
      while (!str.startsWith(prefix)) prefix = prefix.slice(0, -1)
      return prefix
    }, strs[0] ?? ''),

  errorMessage: (e: unknown): string =>
    e instanceof Error ? e.message : String(e),
}

export const Format = {
  uniqueBasenames: (uris: vscode.Uri[]): string[] =>
    [...new Set(uris.map(f => path.basename(f.fsPath)))].sort(),

  columns: (names: string[], termWidth = 80): string[] => {
    const col = Math.max(...names.map(n => n.length)) + 2
    const perRow = Math.max(1, Math.floor(termWidth / col))
    const rowCount = Math.ceil(names.length / perRow)
    return Array.from({ length: rowCount }, (_, i) =>
      names
        .slice(i * perRow, (i + 1) * perRow)
        .map(n => n.padEnd(col))
        .join(''),
    )
  },

  testResult: (t: { name: string; passed: boolean }, nameWidth: number): string => {
    const padded = t.name.padEnd(nameWidth)
    return t.passed
      ? `  ${C.green}✓${C.reset}  ${padded}  ${C.green}passed${C.reset}`
      : `  ${C.red}✗${C.reset}  ${padded}  ${C.red}failed${C.reset}`
  },

  summary: (passCount: number, failCount: number, total: number): string =>
    failCount === 0
      ? `${C.bold}${C.green}All ${total} tests passed ✓${C.reset}`
      : `${C.bold}${passCount}/${total} tests passed${C.reset}  ${C.dim}(${failCount} failed)${C.reset}`,
}

export const FileSystem = {
  hasWorkspace: (): boolean =>
    (vscode.workspace.workspaceFolders?.length ?? 0) > 0,

  activeEditorDir: (): string | undefined => {
    const editor = vscode.window.activeTextEditor
    return editor?.document.uri.scheme === 'file'
      ? path.dirname(editor.document.uri.fsPath)
      : undefined
  },

  activeEditorPath: (): string | undefined => {
    const editor = vscode.window.activeTextEditor
    return editor?.document.uri.scheme === 'file'
      ? editor.document.uri.fsPath
      : undefined
  },

  findFiles: async (pattern: string, limit = 50): Promise<vscode.Uri[]> => {
    if (FileSystem.hasWorkspace()) {
      return vscode.workspace.findFiles(pattern, '**/node_modules/**', limit)
    }

    const dir = FileSystem.activeEditorDir()
    if (!dir) return []

    const prefix = pattern.replace(/\*\*\//g, '').replace(/\*/g, '')

    try {
      return fs
        .readdirSync(dir)
        .filter(f => f.startsWith(prefix))
        .map(f => vscode.Uri.file(path.join(dir, f)))
    } catch {
      return []
    }
  },

  configTarget: (): vscode.ConfigurationTarget =>
    FileSystem.hasWorkspace()
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global,
}

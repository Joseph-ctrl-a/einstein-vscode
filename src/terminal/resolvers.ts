import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { CredentialManager } from '../credentialManager'
import { FileSystem } from '../utils'
import { Output } from './output'
import { C } from '../colors'
import { inferModule } from './moduleInference'

export function createResolvers(output: Output, credentials: CredentialManager) {
  return {
    async file(filename: string): Promise<string | undefined> {
      if (!filename) {
        const filePath = FileSystem.activeEditorPath()
        if (filePath) return filePath
        output.warn(`Usage: ${C.bold}einstein <filename>${C.reset}`)
        return undefined
      }

      if (path.isAbsolute(filename)) return filename

      const dir = FileSystem.activeEditorDir()
      if (dir) {
        const candidate = path.join(dir, filename)
        if (fs.existsSync(candidate)) return candidate
      }

      if (!FileSystem.hasWorkspace()) {
        output.error(`File not found: ${filename}`)
        return undefined
      }

      const matches = await vscode.workspace.findFiles(`**/${filename}`, '**/node_modules/**', 10)

      if (matches.length === 0) {
        output.error(`File not found: ${filename}`)
        return undefined
      }

      if (matches.length === 1) return matches[0].fsPath

      const items = matches.map(u => ({
        label: path.basename(u.fsPath),
        description: vscode.workspace.asRelativePath(u.fsPath),
        fsPath: u.fsPath,
      }))

      const picked = await vscode.window.showQuickPick(items, {
        title: `Multiple files named "${filename}" found — pick one`,
        placeHolder: 'Select file to submit',
      })

      return picked?.fsPath
    },

    async module(filePath: string): Promise<string | undefined> {
      // Explicit saved module always wins
      const config = vscode.workspace.getConfiguration('einstein')
      const saved: string = config.get('defaultModule', '')
      if (saved.trim()) return saved.trim().toLowerCase()

      // Try to infer from file path and filename
      const inferred = await inferModule(filePath)

      if (inferred && !inferred.ambiguous) {
        output.info(`Module inferred: ${inferred.module.toUpperCase()}`)
        return inferred.module
      }

      if (inferred?.ambiguous) {
        // Multiple modules have this task — let the user pick
        const picked = await vscode.window.showQuickPick(inferred.modules, {
          title: `"${path.basename(filePath)}" exists in multiple modules — pick one`,
          placeHolder: 'Select module',
        })
        if (!picked) return undefined
        await config.update('defaultModule', picked, FileSystem.configTarget())
        output.info(`Module set to ${picked.toUpperCase()} (saved)`)
        return picked
      }

      // Could not infer — ask the user
      const input = await vscode.window.showInputBox({
        title: 'Einstein — Module Code',
        prompt: 'Enter your module code (e.g. ca116, csc1035)',
        ignoreFocusOut: true,
        validateInput: v => (v.trim() ? undefined : 'Module code cannot be empty'),
      })

      if (!input?.trim()) return undefined

      const module = input.trim().toLowerCase()
      await config.update('defaultModule', module, FileSystem.configTarget())
      output.info(`Module set to ${module.toUpperCase()} (saved)`)
      return module
    },

    async credentials(): Promise<{ username: string; password: string } | undefined> {
      const existing = await credentials.get()
      if (existing) return existing

      output.warn('No credentials saved. Opening prompt…')
      const creds = await credentials.promptAndStore()
      if (!creds) {
        output.error('Credentials required to submit.')
        return undefined
      }
      return creds
    },
  }
}

export type Resolvers = ReturnType<typeof createResolvers>

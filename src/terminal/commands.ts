import * as vscode from 'vscode'
import * as path from 'path'
import { CredentialManager } from '../credentialManager'
import { submitFile, checkAuth, AuthError, NetworkError } from '../einsteinClient'
import { FileSystem, Str } from '../utils'
import { C } from '../colors'
import { Output } from './output'
import { createResolvers } from './resolvers'

export function createCommands(output: Output, credentials: CredentialManager) {
  const resolve = createResolvers(output, credentials)

  async function submit(filename: string): Promise<void> {
    const filePath = await resolve.file(filename)
    if (!filePath) return

    const module = await resolve.module(filePath)
    if (!module) return

    const creds = await resolve.credentials()
    if (!creds) return

    output.submissionHeader(path.basename(filePath), module)

    try {
      const task = path.basename(filePath, path.extname(filePath))
      const result = await submitFile(filePath, module, task, creds.username, creds.password)

      if (result.testResults.length === 0) {
        output.rawOutput(result.rawOutput.split('\n'))
      } else {
        output.testResults(result.testResults, result.passCount, result.failCount)
      }

      output.reportUrl(result.reportUrl)
      output.divider()
    } catch (e) {
      if (e instanceof AuthError) {
        output.error(`Authentication failed. Run: ${C.bold}set credentials${C.reset}`)
      } else if (e instanceof NetworkError) {
        output.error(`Network error: ${Str.errorMessage(e)}`)
      } else {
        output.error(`Error: ${Str.errorMessage(e)}`)
      }
    }
  }

  async function setModule(module: string): Promise<void> {
    let code = module.toLowerCase()
    if (!code) {
      const input = await vscode.window.showInputBox({
        title: 'Einstein — Module Code',
        prompt: 'Enter your module code (e.g. ca116, csc1035)',
        ignoreFocusOut: true,
      })
      if (!input?.trim()) return
      code = input.trim().toLowerCase()
    }
    const config = vscode.workspace.getConfiguration('einstein')
    await config.update('defaultModule', code, FileSystem.configTarget())
    output.success(`Module set to ${code.toUpperCase()}`)
  }

  async function setCredentials(): Promise<void> {
    output.info('Opening credential prompt…')
    const creds = await credentials.promptAndStore()
    if (!creds) return

    output.info('Verifying…')
    try {
      await checkAuth(creds.username, creds.password)
      output.success('Credentials saved and verified ✓')
    } catch {
      output.warn('Credentials saved (could not reach server to verify).')
    }
  }

  const handlers = new Map<string, (args: string[]) => Promise<void>>([
    ['einstein',        args => submit(args.join(' ').trim())],
    ['help',            ()   => Promise.resolve(output.help())],
    ['clear',           ()   => Promise.resolve(output.clear())],
    ['set module',      args => setModule(args.join(' ').trim())],
    ['set credentials', ()   => setCredentials()],
  ])

  return {
    async dispatch(cmd: string): Promise<void> {
      const parts = cmd.trim().split(/\s+/)
      const verb = parts[0].toLowerCase()
      const twoWord = parts.length >= 2 ? `${verb} ${parts[1].toLowerCase()}` : null

      const isSub = twoWord !== null && handlers.has(twoWord)
      const key = isSub ? twoWord! : verb
      const handler = handlers.get(key)

      if (handler) {
        await handler(parts.slice(isSub ? 2 : 1))
      } else {
        output.warn(`Unknown command "${verb}". Type ${C.bold}help${C.reset}${C.yellow} for usage.`)
      }
    },
  }
}

export type Commands = ReturnType<typeof createCommands>

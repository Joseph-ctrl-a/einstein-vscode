import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { CredentialManager } from './credentialManager'
import {
  checkAuth,
  submitFile,
  AuthError,
  NetworkError,
} from './einsteinClient'

// ─── ANSI colour tokens ───────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  white: '\x1b[97m',
}

// ─── Str — pure string utilities ─────────────────────────────────────────────

const Str = {
  longestCommonPrefix: (strs: string[]): string =>
    strs.reduce((prefix, str) => {
      while (!str.startsWith(prefix)) prefix = prefix.slice(0, -1)
      return prefix
    }, strs[0] ?? ''),

  errorMessage: (e: unknown): string =>
    e instanceof Error ? e.message : String(e),
}

// ─── Format — pure display utilities ─────────────────────────────────────────

const Format = {
  uniqueBasenames: (uris: vscode.Uri[]): string[] =>
    [...new Set(uris.map(f => path.basename(f.fsPath)))].sort(),

  // Split names into rows, pad each name to column width, join into a single string per row
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

  testResult: (
    t: { name: string; passed: boolean },
    nameWidth: number,
  ): string => {
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

// ─── FileSystem — workspace-aware file utilities ──────────────────────────────

const FileSystem = {
  hasWorkspace: (): boolean =>
    (vscode.workspace.workspaceFolders?.length ?? 0) > 0,

  // Returns the directory of the currently open file, if any
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

  // Workspace-aware findFiles — falls back to scanning the active editor's
  // directory when no folder is open, so the tool works with lone open files
  findFiles: async (pattern: string, limit = 50): Promise<vscode.Uri[]> => {
    if (FileSystem.hasWorkspace()) {
      return vscode.workspace.findFiles(pattern, '**/node_modules/**', limit)
    }

    const dir = FileSystem.activeEditorDir()
    if (!dir) return []

    // Strip glob syntax to get the bare prefix we're matching against
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

  // Where to persist config — workspace if one is open, otherwise global
  configTarget: (): vscode.ConfigurationTarget =>
    FileSystem.hasWorkspace()
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global,
}

// ─── PTY class ────────────────────────────────────────────────────────────────

type KeyHandler = () => void

export class EinsteinPty implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>()
  onDidWrite = this.writeEmitter.event

  private inputs: string[] = []
  private historyIndex = 0
  private line = ''
  private busy = false
  private lastTabPartial = ''
  private cursorPos = 0

  constructor(private readonly credentials: CredentialManager) {}

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  open(): void {
    this.printBanner()
    this.prompt()
  }

  close(): void {}

  // ─── Input handling ─────────────────────────────────────────────────────────

  private readonly keyHandlers = new Map<string, KeyHandler>([
    [
      '\r',
      () => {
        this.write('\r\n')
        const cmd = this.line.trim()
        this.line = ''
        this.cursorPos = 0
        if (cmd) {
          this.inputs = [...this.inputs.slice(-499), cmd]
          this.historyIndex = 0
          this.run(cmd)
        } else {
          this.prompt()
        }
      },
    ],
    [
      '\x03',
      () => {
        this.line = ''
        this.cursorPos = 0
        this.write('^C\r\n')
        this.prompt()
      },
    ],
    [
      '\x7f',
      () => {
        if (this.cursorPos > 0) {
          this.line =
            this.line.slice(0, this.cursorPos - 1) +
            this.line.slice(this.cursorPos)
          this.cursorPos--
          const tail = this.line.slice(this.cursorPos)
          this.write('\b' + tail + ' ' + '\x1b[D'.repeat(tail.length + 1))
        }
      },
    ],
    [
      '\x1b[A',
      () => {
        this.historyIndex = Math.min(this.historyIndex + 1, this.inputs.length)
        this.replaceLine(this.inputs.at(-this.historyIndex) ?? this.line)
      },
    ],
    [
      '\x1b[B',
      () => {
        const cmd =
          this.historyIndex <= 0
            ? this.line
            : this.inputs.at(-this.historyIndex--)
        this.replaceLine(cmd ?? this.line)
      },
    ],
    [
      '\x1b[D',
      () => {
        if (this.cursorPos > 0) {
          this.cursorPos--
          this.write('\x1b[D')
        }
      },
    ],
    [
      '\x1b[C',
      () => {
        if (this.cursorPos < this.line.length) {
          this.cursorPos++
          this.write('\x1b[C')
        }
      },
    ],
  ])

  handleInput(data: string): void {
    if (this.busy) return

    if (data === '\t') {
      this.busy = true
      this.handleTab().finally(() => {
        this.busy = false
      })
      return
    }

    this.lastTabPartial = ''

    const handler = this.keyHandlers.get(data)
    if (handler) {
      handler()
    } else if (data >= ' ') {
      this.line =
        this.line.slice(0, this.cursorPos) +
        data +
        this.line.slice(this.cursorPos)
      this.cursorPos++
      const tail = this.line.slice(this.cursorPos)
      this.write(data + tail + '\x1b[D'.repeat(tail.length))
    }
  }

  // ─── Tab completion ──────────────────────────────────────────────────────────

  private async handleTab(): Promise<void> {
    const parts = this.line.trimStart().split(/\s+/)
    if (parts[0]?.toLowerCase() !== 'einstein') {
      this.write('\x07')
      return
    }
    parts.length === 1
      ? await this.tabShowAll()
      : await this.tabComplete(parts[parts.length - 1])
  }

  private async tabShowAll(): Promise<void> {
    const files = await FileSystem.findFiles(
      '**/*.{py,c,h,java,js,ts,cpp,cs,rb,sh}',
    )
    if (files.length === 0) {
      this.write('\x07')
      return
    }
    this.write('\r\n')
    Format.columns(Format.uniqueBasenames(files)).forEach(row =>
      this.writeLine(row),
    )
    this.reprompWithLine()
  }

  private async tabComplete(partial: string): Promise<void> {
    const files = await FileSystem.findFiles(`**/${partial}*`)
    if (files.length === 0) {
      this.write('\x07')
      return
    }

    const names = Format.uniqueBasenames(files)

    if (names.length === 1) {
      const completion = names[0].slice(partial.length)
      this.line += completion
      this.cursorPos += completion.length
      this.write(completion)
      this.lastTabPartial = ''
      return
    }

    const lcp = Str.longestCommonPrefix(names)

    if (lcp.length > partial.length) {
      const completion = lcp.slice(partial.length)
      this.line += completion
      this.cursorPos += completion.length
      this.write(completion)
      this.lastTabPartial = lcp
      return
    }

    if (this.lastTabPartial !== partial) {
      this.lastTabPartial = partial
      this.write('\x07')
      return
    }

    this.write('\r\n')
    Format.columns(names).forEach(row => this.writeLine(row))
    this.reprompWithLine()
  }

  // ─── Command dispatch ────────────────────────────────────────────────────────

  private readonly commands = new Map<
    string,
    (args: string[]) => Promise<void>
  >([
    ['einstein', args => this.handleSubmit(args.join(' ').trim())],
    ['help', () => Promise.resolve(this.printHelp())],
    ['clear', () => Promise.resolve(this.write('\x1b[2J\x1b[H'))],
    ['set module', args => this.handleSetModule(args.join(' ').trim())],
    ['set credentials', () => this.handleSetCredentials()],
  ])

  private async run(cmd: string): Promise<void> {
    this.busy = true
    try {
      await this.dispatch(cmd)
    } catch (e) {
      this.writeLine(
        `${C.red}Unexpected error: ${Str.errorMessage(e)}${C.reset}`,
      )
    } finally {
      this.busy = false
      this.prompt()
    }
  }

  private async dispatch(cmd: string): Promise<void> {
    const parts = cmd.trim().split(/\s+/)
    const verb = parts[0].toLowerCase()
    const twoWord =
      parts.length >= 2 ? `${verb} ${parts[1].toLowerCase()}` : null

    const isSub = twoWord !== null && this.commands.has(twoWord)
    const key = isSub ? twoWord! : verb
    const handler = this.commands.get(key)

    if (handler) {
      await handler(parts.slice(isSub ? 2 : 1))
    } else {
      this.writeLine(
        `${C.yellow}Unknown command "${verb}". Type ${C.bold}help${C.reset}${C.yellow} for usage.${C.reset}`,
      )
    }
  }

  // ─── Command handlers ────────────────────────────────────────────────────────

  private async handleSubmit(filename: string): Promise<void> {
    const filePath = await this.resolveFile(filename)
    if (!filePath) return

    const module = await this.resolveModule()
    if (!module) return

    const creds = await this.resolveCredentials()
    if (!creds) return

    const fileName = path.basename(filePath)
    this.write('\r\n')
    this.writeLine(`${C.dim}${'─'.repeat(48)}${C.reset}`)
    this.writeLine(
      `${C.bold}einstein ${fileName}${C.reset}  ${
        C.dim
      }(${module.toUpperCase()})${C.reset}`,
    )
    this.writeLine(`${C.dim}Uploading…${C.reset}`)

    try {
      const task = path.basename(filePath, path.extname(filePath))
      const result = await submitFile(
        filePath,
        module,
        task,
        creds.username,
        creds.password,
      )
      const { testResults, passCount, failCount, reportUrl } = result

      this.write('\r\n')

      if (testResults.length === 0) {
        this.writeLine(
          `${C.yellow}No test results found in server response.${C.reset}`,
        )
        this.write('\r\n')
        this.writeLine(`${C.dim}Raw output:${C.reset}`)
        result.rawOutput
          .split('\n')
          .slice(0, 20)
          .forEach(l => this.writeLine(`  ${C.dim}${l}${C.reset}`))
      } else {
        const nameWidth = Math.max(...testResults.map(t => t.name.length), 24)
        testResults
          .map(t => Format.testResult(t, nameWidth))
          .forEach(l => this.writeLine(l))
        this.write('\r\n')
        this.writeLine(Format.summary(passCount, failCount, testResults.length))
      }

      this.write('\r\n')
      this.writeLine(`${C.cyan}${reportUrl}${C.reset}`)
      this.writeLine(`${C.dim}${'─'.repeat(48)}${C.reset}`)
    } catch (e) {
      if (e instanceof AuthError) {
        this.writeLine(
          `${C.red}Authentication failed. Run: ${C.bold}set credentials${C.reset}`,
        )
      } else if (e instanceof NetworkError) {
        this.writeLine(
          `${C.red}Network error: ${Str.errorMessage(e)}${C.reset}`,
        )
      } else {
        this.writeLine(`${C.red}Error: ${Str.errorMessage(e)}${C.reset}`)
      }
    }
  }

  private async resolveFile(filename: string): Promise<string | undefined> {
    if (!filename) {
      const filePath = FileSystem.activeEditorPath()
      if (filePath) return filePath
      this.writeLine(`${C.yellow}Usage: ${C.bold}einstein <filename>${C.reset}`)
      return undefined
    }

    if (path.isAbsolute(filename)) return filename

    // Try the active editor's directory first (works with no workspace open)
    const dir = FileSystem.activeEditorDir()
    if (dir) {
      const candidate = path.join(dir, filename)
      if (fs.existsSync(candidate)) return candidate
    }

    // Fall back to workspace search
    if (!FileSystem.hasWorkspace()) {
      this.writeLine(`${C.red}File not found: ${filename}${C.reset}`)
      return undefined
    }

    const matches = await vscode.workspace.findFiles(
      `**/${filename}`,
      '**/node_modules/**',
      10,
    )

    if (matches.length === 0) {
      this.writeLine(`${C.red}File not found: ${filename}${C.reset}`)
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
  }

  private async resolveModule(): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('einstein')
    const saved: string = config.get('defaultModule', '')
    if (saved.trim()) return saved.trim().toLowerCase()

    const input = await vscode.window.showInputBox({
      title: 'Einstein — Module Code',
      prompt: 'Enter your module code (e.g. ca116, csc1035)',
      ignoreFocusOut: true,
      validateInput: v =>
        v.trim() ? undefined : 'Module code cannot be empty',
    })

    if (!input?.trim()) return undefined

    const module = input.trim().toLowerCase()
    await config.update('defaultModule', module, FileSystem.configTarget())
    this.writeLine(
      `${C.dim}Module set to ${module.toUpperCase()} (saved)${C.reset}`,
    )
    return module
  }

  private async resolveCredentials(): Promise<
    { username: string; password: string } | undefined
  > {
    const existing = await this.credentials.get()
    if (existing) return existing

    this.writeLine(`${C.yellow}No credentials saved. Opening prompt…${C.reset}`)
    const creds = await this.credentials.promptAndStore()
    if (!creds) {
      this.writeLine(`${C.red}Credentials required to submit.${C.reset}`)
      return undefined
    }
    return creds
  }

  private async handleSetModule(module: string): Promise<void> {
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
    this.writeLine(`${C.green}Module set to ${code.toUpperCase()}${C.reset}`)
  }

  private async handleSetCredentials(): Promise<void> {
    this.writeLine(`${C.dim}Opening credential prompt…${C.reset}`)
    const creds = await this.credentials.promptAndStore()
    if (!creds) return

    this.writeLine(`${C.dim}Verifying…${C.reset}`)
    try {
      await checkAuth(creds.username, creds.password)
      this.writeLine(`${C.green}Credentials saved and verified ✓${C.reset}`)
    } catch {
      this.writeLine(
        `${C.yellow}Credentials saved (could not reach server to verify).${C.reset}`,
      )
    }
  }

  // ─── Rendering helpers ───────────────────────────────────────────────────────

  private replaceLine(text: string): void {
    // Move to end of line before erasing, since cursor may be mid-line
    this.write('\x1b[C'.repeat(this.line.length - this.cursorPos))
    this.write('\b \b'.repeat(this.line.length))
    this.line = text
    this.cursorPos = text.length
    this.write(this.line)
  }

  private printBanner(): void {
    this.write('\x1b[2J\x1b[H')
    this.writeLine(
      `${C.bold}${C.cyan}⚡ Einstein${C.reset}  ${C.dim}DCU Assignment Submission Tool${C.reset}`,
    )
    this.writeLine(
      `${C.dim}Type ${C.reset}${C.bold}help${C.reset}${C.dim} for usage.${C.reset}`,
    )
    this.write('\r\n')
  }

  private printHelp(): void {
    ;[
      '',
      `${C.bold}Usage:${C.reset}`,
      `  ${C.cyan}einstein <file>${C.reset}          Submit a file  ${C.dim}(e.g. einstein task1.py)${C.reset}`,
      `  ${C.cyan}einstein${C.reset}                 Submit the currently open file`,
      `  ${C.cyan}set module <code>${C.reset}        Set your module  ${C.dim}(e.g. set module ca116)${C.reset}`,
      `  ${C.cyan}set credentials${C.reset}          Update your DCU username/password`,
      `  ${C.cyan}clear${C.reset}                    Clear the terminal`,
      `  ${C.cyan}help${C.reset}                     Show this message`,
      '',
    ].forEach(l => this.writeLine(l))
  }

  private reprompWithLine(): void {
    this.write(`${C.bold}${C.cyan}einstein>${C.reset} ${this.line}`)
  }

  private prompt(): void {
    this.write(`${C.bold}${C.cyan}einstein>${C.reset} `)
  }

  private writeLine(text: string): void {
    this.writeEmitter.fire(text + '\r\n')
  }

  private write(text: string): void {
    this.writeEmitter.fire(text)
  }
}

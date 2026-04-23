import { FileSystem, Format, Str } from '../utils'
import { Output } from './output'
import { History } from './history'
import { Cursor } from './cursor'
import { Commands } from './commands'

interface Terminal {
  output: Output
  history: History
  cursor: Cursor
  commands: Commands
}

export function createInput(terminal: Terminal) {
  let line = ''
  let busy = false
  let lastTabPartial = ''

  function insertChar(char: string) {
    line = line.slice(0, terminal.cursor.pos) + char + line.slice(terminal.cursor.pos)
    terminal.cursor.advance()
    const tail = line.slice(terminal.cursor.pos)
    terminal.output.write(char + tail + '\x1b[D'.repeat(tail.length))
  }

  function replaceLine(text: string) {
    terminal.output.write('\x1b[C'.repeat(line.length - terminal.cursor.pos))
    terminal.output.write('\b \b'.repeat(line.length))
    line = text
    terminal.cursor.moveTo(text.length)
    terminal.output.write(line)
  }

  function submit() {
    terminal.output.write('\r\n')
    const cmd = line.trim()
    line = ''
    terminal.cursor.reset()
    if (cmd) {
      terminal.history.push(cmd)
      busy = true
      terminal.commands.dispatch(cmd).finally(() => {
        busy = false
        terminal.output.prompt()
      })
    } else {
      terminal.output.prompt()
    }
  }

  function interrupt() {
    line = ''
    terminal.cursor.reset()
    terminal.output.write('^C\r\n')
    terminal.output.prompt()
  }

  function backspace() {
    if (!terminal.cursor.canMoveLeft()) return
    line = line.slice(0, terminal.cursor.pos - 1) + line.slice(terminal.cursor.pos)
    terminal.cursor.retreat()
    const tail = line.slice(terminal.cursor.pos)
    terminal.output.write('\b' + tail + ' ' + '\x1b[D'.repeat(tail.length + 1))
  }

  function navigateUp() {
    const entry = terminal.history.navigateUp()
    if (entry !== undefined) replaceLine(entry)
  }

  function navigateDown() {
    const entry = terminal.history.navigateDown()
    replaceLine(entry ?? '')
  }

  function moveLeft() {
    if (!terminal.cursor.canMoveLeft()) return
    terminal.cursor.retreat()
    terminal.output.write('\x1b[D')
  }

  function moveRight() {
    if (!terminal.cursor.canMoveRight(line.length)) return
    terminal.cursor.advance()
    terminal.output.write('\x1b[C')
  }

  async function handleTab(): Promise<void> {
    const parts = line.trimStart().split(/\s+/)
    if (parts[0]?.toLowerCase() !== 'einstein') {
      terminal.output.write('\x07')
      return
    }
    parts.length === 1
      ? await tabShowAll()
      : await tabComplete(parts[parts.length - 1])
  }

  async function tabShowAll(): Promise<void> {
    const files = await FileSystem.findFiles('**/*.{py,c,h,java,js,ts,cpp,cs,rb,sh}')
    if (files.length === 0) {
      terminal.output.write('\x07')
      return
    }
    terminal.output.fileList(Format.uniqueBasenames(files))
    terminal.output.repromptWithLine(line)
  }

  async function tabComplete(partial: string): Promise<void> {
    const files = await FileSystem.findFiles(`**/${partial}*`)
    if (files.length === 0) {
      terminal.output.write('\x07')
      return
    }

    const names = Format.uniqueBasenames(files)

    if (names.length === 1) {
      const completion = names[0].slice(partial.length)
      line += completion
      terminal.cursor.advance(completion.length)
      terminal.output.write(completion)
      lastTabPartial = ''
      return
    }

    const lcp = Str.longestCommonPrefix(names)

    if (lcp.length > partial.length) {
      const completion = lcp.slice(partial.length)
      line += completion
      terminal.cursor.advance(completion.length)
      terminal.output.write(completion)
      lastTabPartial = lcp
      return
    }

    if (lastTabPartial !== partial) {
      lastTabPartial = partial
      terminal.output.write('\x07')
      return
    }

    terminal.output.fileList(names)
    terminal.output.repromptWithLine(line)
  }

  const keyHandlers: Record<string, () => void> = {
    '\r':     submit,
    '\x03':   interrupt,
    '\x7f':   backspace,
    '\x1b[A': navigateUp,
    '\x1b[B': navigateDown,
    '\x1b[D': moveLeft,
    '\x1b[C': moveRight,
  }

  return {
    handle(data: string) {
      if (busy) return

      if (data === '\t') {
        busy = true
        handleTab().finally(() => { busy = false })
        return
      }

      lastTabPartial = ''

      const handler = keyHandlers[data]
      if (handler) {
        handler()
      } else if (data >= ' ') {
        insertChar(data)
      }
    },
  }
}

export type Input = ReturnType<typeof createInput>

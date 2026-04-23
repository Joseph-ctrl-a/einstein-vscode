import { CredentialManager } from '../credentialManager'
import { createOutput } from './output'
import { createHistory } from './history'
import { createCursor } from './cursor'
import { createCommands } from './commands'
import { createInput } from './input'

export function createTerminal(credentials: CredentialManager, emit: (text: string) => void) {
  const output   = createOutput(emit)
  const history  = createHistory()
  const cursor   = createCursor()
  const commands = createCommands(output, credentials)
  const input    = createInput({ output, history, cursor, commands })

  return { output, history, cursor, commands, input }
}

export type Terminal = ReturnType<typeof createTerminal>

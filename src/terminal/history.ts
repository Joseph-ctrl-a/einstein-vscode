export function createHistory() {
  let entries: string[] = []
  let index = 0

  return {
    push(cmd: string) {
      entries = [...entries.slice(-499), cmd]
      index = 0
    },

    navigateUp(): string | undefined {
      index = Math.min(index + 1, entries.length)
      return entries.at(-index)
    },

    navigateDown(): string | undefined {
      if (index <= 0) return undefined
      index--
      return index === 0 ? undefined : entries.at(-index)
    },

    reset() {
      index = 0
    },
  }
}

export type History = ReturnType<typeof createHistory>

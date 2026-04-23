import * as path from 'path'
import * as crypto from 'crypto'
import { fetchTasksDb } from '../einsteinClient'

// DCU module codes look like: ca116, csc1035, ee319, ms121, ca277
const MODULE_PATTERN = /\b([a-z]{2,3}\d{3,4})\b/i

// Original script hashes the filename WITH extension (e.g. "sum_alphabet_order.py")
function taskHash(fileName: string): string {
  return crypto.createHash('sha1').update(fileName).digest('hex')
}

function matchInPath(filePath: string): string | undefined {
  const parts = filePath.split(path.sep)

  // Exact component match first (e.g. a directory literally named "ca116")
  for (const part of parts) {
    const m = part.match(MODULE_PATTERN)
    if (m) return m[1].toLowerCase()
  }

  // Sloppy match — module code appears anywhere in the full path
  const m = filePath.toLowerCase().match(MODULE_PATTERN)
  return m ? m[1].toLowerCase() : undefined
}

async function matchByTaskHash(fileName: string): Promise<string[]> {
  try {
    const db = await fetchTasksDb()
    return db.get(taskHash(fileName)) ?? []
  } catch {
    return []
  }
}

export async function inferModule(
  filePath: string,
): Promise<{ module: string; ambiguous: false } | { modules: string[]; ambiguous: true } | null> {
  const fromPath = matchInPath(filePath)
  if (fromPath) return { module: fromPath, ambiguous: false }

  const fileName = path.basename(filePath)
  const fromHash = await matchByTaskHash(fileName)
  if (fromHash.length === 1) return { module: fromHash[0], ambiguous: false }
  if (fromHash.length > 1)  return { modules: fromHash, ambiguous: true }

  return null
}

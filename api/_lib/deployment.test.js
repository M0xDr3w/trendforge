import { describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const apiDir = join(fileURLToPath(import.meta.url), '..', '..')

/** Collect *.test.js files that Vercel would deploy as Serverless Functions. */
function deployedTestFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      // Underscore-prefixed dirs are private helpers, never deployed.
      if (!entry.startsWith('_')) deployedTestFiles(full, out)
    } else if (entry.endsWith('.test.js')) {
      out.push(full)
    }
  }
  return out
}

describe('vercel deployment budget', () => {
  it('keeps every api test under underscore dirs (not a function)', () => {
    // Hobby allows 12 functions; test files outside _-dirs count AND ship
    // as public endpoints. Route tests live in api/_tests/ or api/_lib/.
    expect(deployedTestFiles(apiDir)).toEqual([])
  })
})

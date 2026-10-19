import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * agent/AGENTS.md §10 ("Phase C") used to tell the bot to tag each note by
 * family and keep them out of each other's way by discipline. That was
 * prompt-only: a single shared agent/MEMORY.md with no code behind the
 * separation. This suite proves the file-path-selection logic the bot is now
 * required to run (agent/skills/memory-path.sh) actually partitions by
 * family — different familyIds resolve to different files, and it never
 * falls back to a shared, unscoped path.
 */

const repoRoot = path.resolve(__dirname, '..', '..')
const scriptPath = path.join(repoRoot, 'agent', 'skills', 'memory-path.sh')
const agentsMdPath = path.join(repoRoot, 'agent', 'AGENTS.md')

function resolvePath(familyId: string): string {
  return execFileSync('bash', [scriptPath, familyId], { encoding: 'utf8' }).trim()
}

function rejects(familyId: string): boolean {
  try {
    execFileSync('bash', [scriptPath, familyId], { stdio: ['ignore', 'ignore', 'ignore'] })
    return false
  } catch {
    return true
  }
}

describe('family-scoped memory path (agent/skills/memory-path.sh)', () => {
  it('routes two different families to two different files', () => {
    const a = resolvePath('clfam0000000000000000001')
    const b = resolvePath('clfam0000000000000000002')
    expect(a).toBe('memory/family-clfam0000000000000000001.md')
    expect(b).toBe('memory/family-clfam0000000000000000002.md')
    expect(a).not.toBe(b)
  })

  it('is injective: no two distinct familyIds collide on the same path', () => {
    const ids = ['a', 'ab', 'abc', 'a-b', 'a_b', 'A1', 'clxyz123', 'clxyz1234']
    const paths = ids.map(resolvePath)
    expect(new Set(paths).size).toBe(ids.length)
  })

  it('never resolves to the old shared memory file, for any valid familyId', () => {
    for (const familyId of ['abc123', 'clxabc999', 'family-1', 'MEMORY']) {
      const resolved = resolvePath(familyId)
      expect(resolved).not.toBe('MEMORY.md')
      expect(resolved).not.toBe('agent/MEMORY.md')
      expect(resolved).toMatch(/^memory\/family-.+\.md$/)
    }
  })

  it('rejects a missing familyId instead of defaulting to a shared path', () => {
    expect(rejects('')).toBe(true)
  })

  it('rejects a familyId that could escape the memory/ directory', () => {
    expect(rejects('../../etc/passwd')).toBe(true)
    expect(rejects('foo/bar')).toBe(true)
    expect(rejects('foo.bar')).toBe(true)
  })

  it('ships executable, so the agent can actually run it from AGENTS.md as documented', () => {
    const mode = fs.statSync(scriptPath).mode
    expect(mode & 0o111).not.toBe(0)
  })
})

describe('AGENTS.md documents the enforced mechanism, not the old self-tagging convention', () => {
  const agentsMd = fs.readFileSync(agentsMdPath, 'utf8')

  it('tells the agent to resolve the memory path via the script', () => {
    expect(agentsMd).toMatch(/memory-path\.sh/)
  })

  it('no longer asks the model to self-enforce separation by tagging headings', () => {
    expect(agentsMd).not.toMatch(/Tag every note with who it's about/)
  })
})

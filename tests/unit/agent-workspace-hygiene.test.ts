import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The agent workspace is half source, half runtime state, and the two live in
 * the same directory:
 *
 *   AGENTS.md, SOUL.md, skills/   authored — they ship with the repo
 *   CLAUDE.md                     composed by the gateway from those, on every
 *                                 boot, including the host's own skill list
 *   MEMORY.md, USER.md            written by the agent while it runs; in a real
 *                                 install they hold children's names, their
 *                                 HabitHero user ids and a parent's
 *                                 channel_user_ref
 *
 * In an install the gateway bind-mounts this directory into the agent container
 * and writes to it live, so a checkout of this repo can have a dirty working
 * tree it never asked for. That makes `git add -A` enough to publish one
 * family's private data to a public repo, which is how the two generated files
 * got committed in the first place.
 *
 * These assertions are the guard: the generated files stay untracked AND
 * ignored, and the authored ones stay tracked. Ignoring is not enough on its
 * own — `git add -f` beats .gitignore, and an already-tracked file ignores it
 * entirely.
 */

const repoRoot = path.resolve(__dirname, '..', '..')

const GENERATED = ['agent/CLAUDE.md', 'agent/MEMORY.md', 'agent/USER.md']
const AUTHORED = ['agent/AGENTS.md', 'agent/SOUL.md', 'agent/skills/today.md']

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
}

/** git exits non-zero to mean "no", which execFileSync raises. */
function gitSucceeds(args: string[]): boolean {
  try {
    git(args)
    return true
  } catch {
    return false
  }
}

const insideGitRepo = gitSucceeds(['rev-parse', '--git-dir'])

describe.runIf(insideGitRepo)('agent workspace hygiene', () => {
  const trackedFiles = git(['ls-files', 'agent/']).split('\n').filter(Boolean)
  const tracked = new Set(trackedFiles)

  it.each(GENERATED)('does not track %s — it is generated or private', (file) => {
    expect(tracked.has(file)).toBe(false)
  })

  it.each(GENERATED)('ignores %s so a stray `git add -A` cannot stage it', (file) => {
    expect(gitSucceeds(['check-ignore', '-q', file])).toBe(true)
  })

  it.each(AUTHORED)('still tracks %s — this is source, not state', (file) => {
    expect(tracked.has(file)).toBe(true)
  })

  it('tracks the skills the agent is built from', () => {
    const skills = trackedFiles.filter((f) => f.startsWith('agent/skills/'))
    expect(skills.length).toBeGreaterThan(0)
  })
})

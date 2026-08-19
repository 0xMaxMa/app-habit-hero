import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The agent workspace is half source, half runtime state, and the two live in
 * the same directory:
 *
 *   AGENTS.md, SOUL.md, skills/   authored — they ship with the repo
 *   CLAUDE.md                     composed by the gateway from those, on every
 *                                 boot, including the host's own skill list
 *   MEMORY.md, USER.md            written by the agent while it runs
 *   memory/, .dreaming/, .claude/ episodic memory, dream state, tool config
 *   anything else                 the agent writes notes and scratch files
 *                                 here too; real workspaces on a gateway host
 *                                 accumulate HEARTBEAT.md, SKILLS_LEARNED.md,
 *                                 loose .md notes, even scripts and archives
 *
 * In an install the gateway bind-mounts this directory into the agent
 * container as /workspace and writes to it live, so a checkout of this repo
 * can have a dirty working tree it never asked for. On a real install those
 * files hold children's names, their HabitHero user ids and a parent's
 * channel_user_ref, and this repo is public — `git add -A` is all it takes.
 *
 * .gitignore therefore ignores agent/* and re-admits only the authored files.
 * These assertions pin both directions of that: everything the gateway writes
 * stays ignored, and everything the app ships stays tracked. Both halves
 * matter — an allowlist that drifts silently drops real source, and ignoring
 * has no effect at all on a file that is already tracked.
 */

const repoRoot = path.resolve(__dirname, '..', '..')

/**
 * Paths the gateway writes into the workspace. They need not exist: the point
 * is that .gitignore covers the shape, so the first one to appear on a
 * developer's machine is already ignored rather than offered up by `git add`.
 */
const GENERATED = [
  'agent/CLAUDE.md',
  'agent/MEMORY.md',
  'agent/USER.md',
  'agent/memory/habit-hero.md',
  'agent/memory/archive/2026-08.md',
  'agent/.dreaming/state.json',
  'agent/.claude/settings.json',
  'agent/.sessions/abc.json',
  'agent/.telegram-state/state.json',
  'agent/.discord-state/state.json',
  'agent/.line-state/state.json',
  'agent/HEARTBEAT.md',
  'agent/SKILLS_LEARNED.md',
  'agent/scratch-note.md',
]

/** The files that are genuinely source and must survive the allowlist. */
const AUTHORED = ['agent/AGENTS.md', 'agent/SOUL.md']

function git(args: string[]): string {
  // stderr is discarded: the probe below is expected to fail outside a git
  // checkout, and its "fatal: not a git repository" would otherwise be printed
  // as noise in an otherwise-clean test run.
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
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

// A source tarball or a "Download ZIP" has no .git, and `npm test` must still
// pass there. Every git call below is deferred so that merely collecting this
// suite cannot shell out — `describe.runIf` skips the tests, but Vitest still
// runs the describe callback itself.
const insideGitRepo = gitSucceeds(['rev-parse', '--git-dir'])

describe.runIf(insideGitRepo)('agent workspace hygiene', () => {
  let trackedFiles: string[]

  beforeAll(() => {
    trackedFiles = git(['ls-files', 'agent/']).split('\n').filter(Boolean)
  })

  it.each(GENERATED)('does not track %s — the gateway writes it', (file) => {
    expect(trackedFiles).not.toContain(file)
  })

  it.each(GENERATED)('ignores %s so a stray `git add -A` cannot stage it', (file) => {
    expect(gitSucceeds(['check-ignore', '-q', file])).toBe(true)
  })

  it.each(AUTHORED)('still tracks %s — this is source, not state', (file) => {
    expect(trackedFiles).toContain(file)
  })

  it('tracks the skills the agent is built from', () => {
    const skills = trackedFiles.filter((f) => f.startsWith('agent/skills/'))
    expect(skills.length).toBeGreaterThan(0)
  })

  it('tracks nothing under agent/ outside the allowlist', () => {
    const allowed = (f: string) =>
      f === 'agent/.gitkeep' || AUTHORED.includes(f) || f.startsWith('agent/skills/')
    expect(trackedFiles.filter((f) => !allowed(f))).toEqual([])
  })
})

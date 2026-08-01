/**
 * tests/integration/avatar.test.ts — API integration for child avatar upload.
 *
 * Exercises the real route handlers against the real test Postgres + local
 * volume: parent uploads an avatar (multipart), it persists to User.avatarUrl
 * and to disk, the family-scoped serve route returns the bytes, DELETE clears
 * it, and a child caller is refused (parent-only, T30).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { POST as avatarPost, DELETE as avatarDelete } from '@/app/api/members/[id]/avatar/route'
import { GET as avatarServe } from '@/app/api/avatars/[...path]/route'
import { GET as membersGet } from '@/app/api/members/route'
import { resetAndSeed, getRefs, prisma } from './helpers/db'
import { AGENT_TOKEN } from './helpers/actor'

const ORIGIN = 'http://t'

// 1x1 transparent PNG.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

/** Multipart headers only — never set content-type so req.formData() works. */
function agentMultipart(actorRef: string): Record<string, string> {
  return { 'x-agent-token': AGENT_TOKEN, 'x-actor-ref': actorRef }
}

function uploadReq(childId: string, actorRef: string, file: File): Request {
  const form = new FormData()
  form.append('avatar', file)
  return new Request(`${ORIGIN}/api/members/${childId}/avatar`, {
    method: 'POST',
    headers: agentMultipart(actorRef),
    body: form,
  })
}

beforeEach(async () => {
  await resetAndSeed()
})

describe('child avatar upload', () => {
  it('parent uploads an avatar → persisted to DB, disk, and served back', async () => {
    const { parentRef, childAId } = await getRefs()
    const file = new File([PNG_BYTES], 'kid.png', { type: 'image/png' })

    const res = await avatarPost(uploadReq(childAId, parentRef, file), {
      params: { id: childAId },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    const url: string = body.data.member.avatarUrl
    expect(url).toMatch(/^\/api\/avatars\//)

    // DB side-effect.
    const child = await prisma.user.findUnique({ where: { id: childAId } })
    expect(child?.avatarUrl).toBe(url)

    // Serve route returns the bytes, family-scoped.
    const filename = url.split('/').pop() as string
    const serveRes = await avatarServe(
      new Request(`${ORIGIN}${url}`, { headers: agentMultipart(parentRef) }),
      { params: { path: [filename] } },
    )
    expect(serveRes.status).toBe(200)
    expect(serveRes.headers.get('Content-Type')).toBe('image/png')
    const served = Buffer.from(await serveRes.arrayBuffer())
    expect(served.length).toBe(PNG_BYTES.length)
  })

  it('members GET surfaces the avatarUrl', async () => {
    const { parentRef, childAId } = await getRefs()
    const file = new File([PNG_BYTES], 'kid.png', { type: 'image/png' })
    await avatarPost(uploadReq(childAId, parentRef, file), { params: { id: childAId } })

    const res = await membersGet(
      new Request(`${ORIGIN}/api/members`, { headers: agentMultipart(parentRef) }),
    )
    const members = (await res.json()).data.members as { id: string; avatarUrl: string | null }[]
    const kid = members.find((m) => m.id === childAId)
    expect(kid?.avatarUrl).toMatch(/^\/api\/avatars\//)
  })

  it('DELETE clears the avatar', async () => {
    const { parentRef, childAId } = await getRefs()
    const file = new File([PNG_BYTES], 'kid.png', { type: 'image/png' })
    await avatarPost(uploadReq(childAId, parentRef, file), { params: { id: childAId } })

    const res = await avatarDelete(
      new Request(`${ORIGIN}/api/members/${childAId}/avatar`, {
        method: 'DELETE',
        headers: agentMultipart(parentRef),
      }),
      { params: { id: childAId } },
    )
    expect(res.status).toBe(200)
    const child = await prisma.user.findUnique({ where: { id: childAId } })
    expect(child?.avatarUrl).toBeNull()
  })

  it('rejects a non-image file (400)', async () => {
    const { parentRef, childAId } = await getRefs()
    const file = new File([Buffer.from('not an image')], 'x.txt', { type: 'text/plain' })
    const res = await avatarPost(uploadReq(childAId, parentRef, file), {
      params: { id: childAId },
    })
    expect(res.status).toBe(400)
  })

  it('a child caller cannot upload (403, parent-only)', async () => {
    const { childARef, childAId } = await getRefs()
    const file = new File([PNG_BYTES], 'kid.png', { type: 'image/png' })
    const res = await avatarPost(uploadReq(childAId, childARef, file), {
      params: { id: childAId },
    })
    expect(res.status).toBe(403)
  })

  it('a parent can upload their OWN avatar (target = parent, isSelf true)', async () => {
    const { parentRef, parentId } = await getRefs()
    const file = new File([PNG_BYTES], 'me.png', { type: 'image/png' })
    const res = await avatarPost(uploadReq(parentId, parentRef, file), {
      params: { id: parentId },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.member.avatarUrl).toMatch(/^\/api\/avatars\//)
    expect(body.data.member.isSelf).toBe(true)

    const parent = await prisma.user.findUnique({ where: { id: parentId } })
    expect(parent?.avatarUrl).toBe(body.data.member.avatarUrl)
  })
})

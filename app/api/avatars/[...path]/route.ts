/**
 * app/api/avatars/[...path]/route.ts
 *
 * GET — serve a child's uploaded avatar from the local volume (lib/api/photo).
 * Family-scoped: the requester must belong to the family that owns the user
 * whose avatarUrl references this file. Mirrors the photos serve route but
 * authorizes off User.avatarUrl instead of a completion.
 */

import { NextResponse } from 'next/server'
import { withHandler, resolveActor, assertFamily, notFound, readPhoto } from '@/lib/api'
import { prisma } from '@/lib/db'
import path from 'node:path'

export const dynamic = 'force-dynamic'

export const GET = withHandler<{ params: { path: string[] } }>(async (req, { params }) => {
  const actor = await resolveActor(req)

  const filename = path.basename((params.path ?? []).join('/'))
  if (!filename) throw notFound('Avatar not found')

  const owner = await prisma.user.findFirst({
    where: { avatarUrl: `/api/avatars/${filename}` },
    select: { familyId: true },
  })
  if (!owner) throw notFound('Avatar not found')
  assertFamily(actor, owner.familyId)

  const { data, contentType } = await readPhoto(filename)

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  })
})

/**
 * app/api/photos/[...path]/route.ts (T17 / T19)
 *
 * GET — serve a chore-completion photo from the local volume (lib/api/photo).
 * Access is family-scoped: the requester must belong to the family that owns the
 * completion referencing this photo. Unknown / unreferenced photos → 404.
 */

import { NextResponse } from 'next/server'
import { withHandler, resolveActor, assertFamily, notFound, readPhoto } from '@/lib/api'
import { prisma } from '@/lib/db'
import path from 'node:path'

export const dynamic = 'force-dynamic'

export const GET = withHandler<{ params: { path: string[] } }>(async (req, { params }) => {
  const actor = await resolveActor(req)

  // Catch-all → a single stored filename. Anything with path structure is
  // rejected by readPhoto's basename check (traversal guard).
  const filename = path.basename((params.path ?? []).join('/'))
  if (!filename) throw notFound('Photo not found')

  // Authorize via the completion that references this photo, so a family can
  // only read its own uploads.
  const completion = await prisma.choreCompletion.findFirst({
    where: { photoUrl: `/api/photos/${filename}` },
    include: { chore: { select: { familyId: true } } },
  })
  if (!completion) throw notFound('Photo not found')
  assertFamily(actor, completion.chore.familyId)

  const { data, contentType } = await readPhoto(filename)

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  })
})

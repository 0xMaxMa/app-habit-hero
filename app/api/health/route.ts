import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { photoDirStatus } from '@/lib/api/photo'

// Never cache — this must reflect live DB reachability on every call.
export const dynamic = 'force-dynamic'

/**
 * Liveness for the container healthcheck in app.yaml.
 *
 * Both dependencies are checked, not just the database. An unwritable photo
 * volume takes away submitting a chore with a photo and changing an avatar —
 * yet it used to leave this endpoint returning a cheerful 200, so `docker ps`
 * showed "healthy" while the feature was dead. Reporting it here makes the
 * container go unhealthy instead of failing silently.
 */
export async function GET() {
  const [db, storage] = await Promise.all([
    prisma
      .$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false),
    photoDirStatus(),
  ])

  const body = {
    status: db && storage.writable ? 'ok' : 'error',
    db: db ? 'connected' : 'disconnected',
    photos: storage.writable ? 'writable' : `not writable (${storage.reason})`,
  }

  if (body.status === 'ok') return NextResponse.json(body)

  // Log server-side too: the healthcheck output is not kept anywhere, so
  // without this the reason for an unhealthy container is invisible.
  console.error(`[health] ${JSON.stringify(body)}`)
  return NextResponse.json(body, { status: 503 })
}

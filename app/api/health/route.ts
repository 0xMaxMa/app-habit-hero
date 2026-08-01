import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

// Never cache — this must reflect live DB reachability on every call.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Real round-trip to Postgres, not a bare 200.
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', db: 'connected' })
  } catch {
    return NextResponse.json(
      { status: 'error', db: 'disconnected' },
      { status: 503 },
    )
  }
}

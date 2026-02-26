import { NextResponse } from 'next/server'
import { pool } from '@/lib/automation/pool'

export const dynamic = 'force-dynamic'

export async function GET() {
    return NextResponse.json(pool.stats)
}

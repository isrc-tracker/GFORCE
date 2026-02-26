import { NextResponse } from 'next/server'
import { pool } from '@/lib/automation/pool'

export async function GET() {
    return NextResponse.json(pool.stats)
}

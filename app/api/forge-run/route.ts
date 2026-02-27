import { NextRequest, NextResponse } from 'next/server'
import { ForgeEngine } from '@/lib/automation/forge'
import { pool } from '@/lib/automation/pool'

export const dynamic = 'force-dynamic'

const MAX_RESULT_BYTES = 100_000

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}))
    const intent: string = body?.intent

    if (!intent || typeof intent !== 'string' || !intent.trim()) {
        return NextResponse.json({ success: false, error: 'intent is required' }, { status: 400 })
    }
    if (intent.length > 2000) {
        return NextResponse.json({ success: false, error: 'intent exceeds 2000 char limit' }, { status: 400 })
    }

    // Step 1: Forge the skill
    let skill: Awaited<ReturnType<typeof ForgeEngine.blacksmith>>
    try {
        skill = await ForgeEngine.blacksmith(intent.trim(), body?.context)
    } catch (err) {
        const msg = (err as Error).message
        const safe = msg.startsWith('Security') ? 'Skill validation failed' : msg
        return NextResponse.json({ success: false, stage: 'forge', error: safe }, { status: 500 })
    }

    // Step 2: Execute immediately
    const slot = await pool.acquire(60_000)
    try {
        const raw = await skill.execute({ page: slot.page, context: slot.context })
        const json = JSON.stringify(raw, null, 2)
        const truncated = json.length > MAX_RESULT_BYTES
        return NextResponse.json({
            success: true,
            skill: { id: skill.id, name: skill.name, description: skill.description },
            result: truncated ? `${json.slice(0, MAX_RESULT_BYTES)}\n... [truncated]` : raw,
            truncated,
        })
    } catch (err) {
        return NextResponse.json({
            success: false,
            stage: 'execute',
            skill: { id: skill.id, name: skill.name, description: skill.description },
            error: (err as Error).message,
        }, { status: 500 })
    } finally {
        await slot.release()
    }
}

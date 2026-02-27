import { NextRequest, NextResponse } from 'next/server'
import { skillRegistry } from '@/lib/automation/skills'
import { ensureSkillsLoaded } from '@/lib/automation/forge'
import { pool } from '@/lib/automation/pool'

export const dynamic = 'force-dynamic'

const MAX_RESULT_BYTES = 100_000

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const { id } = await params
    const body = await req.json().catch(() => ({} as { args?: unknown }))
    const args = Array.isArray(body?.args) ? body.args : []

    await ensureSkillsLoaded()

    const skill = skillRegistry.get(id)
    if (!skill) {
        return NextResponse.json({ success: false, error: `Skill '${id}' not found` }, { status: 404 })
    }

    const slot = await pool.acquire(60_000)
    try {
        const raw = await skill.execute({ page: slot.page, context: slot.context }, ...args)
        const json = JSON.stringify(raw, null, 2)
        if (json.length > MAX_RESULT_BYTES) {
            return NextResponse.json({
                success: true,
                result: `${json.slice(0, MAX_RESULT_BYTES)}\n... [truncated]`,
                truncated: true,
            })
        }
        return NextResponse.json({ success: true, result: raw, truncated: false })
    } catch (err) {
        return NextResponse.json(
            { success: false, error: (err as Error).message },
            { status: 500 }
        )
    } finally {
        await slot.release()
    }
}

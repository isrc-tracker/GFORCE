import { NextRequest, NextResponse } from 'next/server'
import { ForgeEngine } from '@/lib/automation/forge'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const intent: string = body?.intent

        if (!intent || typeof intent !== 'string' || !intent.trim()) {
            return NextResponse.json(
                { success: false, error: 'intent is required' },
                { status: 400 }
            )
        }

        if (intent.length > 2000) {
            return NextResponse.json(
                { success: false, error: 'intent exceeds 2000 char limit' },
                { status: 400 }
            )
        }

        const skill = await ForgeEngine.blacksmith(intent.trim(), body?.context)

        if (!skill) {
            return NextResponse.json(
                { success: false, error: 'Forge failed to generate a skill' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            skillId: skill.id,
            name: skill.name,
            description: skill.description,
        })
    } catch (err) {
        const msg = (err as Error).message
        const safe = msg.startsWith('Security') ? 'Skill validation failed' : msg
        return NextResponse.json(
            { success: false, error: safe },
            { status: 500 }
        )
    }
}

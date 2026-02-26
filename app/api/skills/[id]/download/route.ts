import { NextRequest, NextResponse } from 'next/server'
import { getSkill } from '@/lib/automation/skill-store'

export const dynamic = 'force-dynamic'

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const skill = await getSkill(id)

    if (!skill) {
        return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }

    const ts = `/**
 * G-Force Skill: ${skill.name}
 * ID: ${skill.id}
 * Description: ${skill.description}
 * Created: ${skill.createdAt}
 */
import type { Page, BrowserContext } from 'playwright'

export async function execute(page: Page, context: BrowserContext, ...args: any[]): Promise<any> {
    ${skill.executeBody}
}
`

    return new NextResponse(ts, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="${skill.id}.ts"`,
        },
    })
}

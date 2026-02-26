import { NextRequest, NextResponse } from 'next/server'
import { ForgeEngine } from '@/lib/automation/forge'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const intent: string = body?.intent

        if (!intent || typeof intent !== 'string' || !intent.trim()) {
            return NextResponse.json({ success: false, error: 'intent is required' }, { status: 400 })
        }

        if (intent.length > 3000) {
            return NextResponse.json({ success: false, error: 'intent exceeds 3000 char limit' }, { status: 400 })
        }

        const result = await ForgeEngine.fabricate(intent.trim(), body?.context)

        if (!result) {
            return NextResponse.json({ success: false, error: 'Fabrication failed' }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            filename: result.filename,
            description: result.description,
            code: result.code,
            downloadUrl: `/api/software/${encodeURIComponent(result.filename)}/download`,
        })
    } catch (err) {
        return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
    }
}

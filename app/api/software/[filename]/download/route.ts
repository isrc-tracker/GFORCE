import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const TOOLS_DIR = path.join(process.cwd(), 'tools')

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const { filename } = await params
    // Prevent path traversal
    const safe = path.basename(decodeURIComponent(filename))
    const filePath = path.join(TOOLS_DIR, safe)

    try {
        const code = await fs.readFile(filePath, 'utf-8')
        const ext = path.extname(safe).toLowerCase()
        const mime =
            ext === '.ts' || ext === '.js' ? 'text/javascript' :
            ext === '.py' ? 'text/x-python' :
            ext === '.sh' ? 'text/x-shellscript' :
            'text/plain'

        return new NextResponse(code, {
            headers: {
                'Content-Type': `${mime}; charset=utf-8`,
                'Content-Disposition': `attachment; filename="${safe}"`,
            },
        })
    } catch {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
}

import { NextRequest, NextResponse } from 'next/server'

// Edge-compatible in-memory rate limiter (no Node.js APIs)
const counts = new Map<string, { n: number; exp: number }>()

const LIMITS: Array<{ prefix: string; rpm: number; burst: number }> = [
    { prefix: '/api/audit',    rpm: 3,  burst: 2  },
    { prefix: '/api/forge',    rpm: 10, burst: 5  },
    { prefix: '/api/software', rpm: 10, burst: 5  },
    { prefix: '/api/',         rpm: 60, burst: 20 },
]

function rateCheck(key: string, rpm: number): { ok: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    const win = 60_000
    let entry = counts.get(key)
    if (!entry || now > entry.exp) {
        entry = { n: 0, exp: now + win }
        counts.set(key, entry)
    }
    const ok = entry.n < rpm
    if (ok) entry.n++
    return { ok, remaining: Math.max(0, rpm - entry.n), resetAt: entry.exp }
}

export function middleware(req: NextRequest) {
    const path = req.nextUrl.pathname
    if (!path.startsWith('/api/')) return NextResponse.next()

    // ── Auth ────────────────────────────────────────────────────────────────
    const key = process.env.GFORCE_API_KEY
    if (key) {
        const provided =
            req.headers.get('x-gforce-key') ??
            req.nextUrl.searchParams.get('key')
        if (provided !== key) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
    }

    // ── Rate limit ──────────────────────────────────────────────────────────
    const ip =
        req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
        req.headers.get('x-real-ip') ??
        'unknown'

    const rule = LIMITS.find(r => path.startsWith(r.prefix)) ?? LIMITS[LIMITS.length - 1]
    const { ok, remaining, resetAt } = rateCheck(`${ip}:${rule.prefix}`, rule.rpm)

    if (!ok) {
        return NextResponse.json(
            { error: 'Rate limit exceeded. Slow down.' },
            {
                status: 429,
                headers: {
                    'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
                    'X-RateLimit-Limit':     String(rule.rpm),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset':     String(Math.floor(resetAt / 1000)),
                },
            }
        )
    }

    const res = NextResponse.next()
    res.headers.set('X-RateLimit-Limit',     String(rule.rpm))
    res.headers.set('X-RateLimit-Remaining', String(remaining))
    res.headers.set('X-RateLimit-Reset',     String(Math.floor(resetAt / 1000)))
    return res
}

export const config = {
    matcher: '/api/:path*',
}

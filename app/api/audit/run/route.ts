import { NextResponse } from 'next/server'
import { pool } from '@/lib/automation/pool'

export const dynamic = 'force-dynamic'

const AUDIT_SITES = [
    { name: 'SannySoft (Core Stealth)', url: 'https://bot.sannysoft.com/' },
    { name: 'BrowserScan (Deep Fingerprint)', url: 'https://www.browserscan.net' },
    { name: 'CreepJS (Behavioral Audit)', url: 'https://abrahamjuliot.github.io/creepjs/' },
]

export async function POST() {
    const results: Array<{
        site: string
        status: 'pass' | 'fail'
        title?: string
        error?: string
    }> = []

    const slot = await pool.acquire(90_000)

    try {
        for (const site of AUDIT_SITES) {
            try {
                await slot.page.goto(site.url, { waitUntil: 'networkidle', timeout: 60_000 })
                // Give fingerprint scripts time to run
                await new Promise(r => setTimeout(r, 4000))
                const title = await slot.page.title()
                results.push({ site: site.name, status: 'pass', title })
            } catch (err) {
                results.push({ site: site.name, status: 'fail', error: (err as Error).message })
            }
        }
    } finally {
        await slot.release()
    }

    const passed = results.filter(r => r.status === 'pass').length
    return NextResponse.json({
        success: true,
        score: `${passed}/${results.length}`,
        results,
    })
}

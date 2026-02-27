import { NextRequest, NextResponse } from 'next/server'
import { ForgeEngine } from '@/lib/automation/forge'
import { loadAllSkills } from '@/lib/automation/skill-store'
import { pool } from '@/lib/automation/pool'
import { sendMessage, sendDocument } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

const HELP_TEXT = `*G-Force Remote Commands*

/forge <intent> — Forge a browser automation skill
/build <intent> — Fabricate standalone software
/audit — Run stealth fingerprint audit
/skills — List all saved skills
/help — Show this message

*Examples:*
\`/forge scrape top 10 Hacker News titles\`
\`/build Node.js script to monitor URLs\``

function isAllowed(userId: number): boolean {
    const allowed = process.env.TELEGRAM_ALLOWED_IDS
    if (!allowed || !allowed.trim()) return true
    return allowed.split(',').map(s => s.trim()).includes(String(userId))
}

async function handleCommand(chatId: number, text: string): Promise<void> {
    const lower = text.trim()

    if (lower === '/help' || lower === '/start') {
        await sendMessage(chatId, HELP_TEXT)
        return
    }

    if (lower === '/audit') {
        await sendMessage(chatId, '`[AUDIT]` Running stealth fingerprint audit... (60-90s)')
        const slot = await pool.acquire(90_000)
        const results: Array<{ site: string; status: string; title?: string; error?: string }> = []
        const sites = [
            { name: 'SannySoft', url: 'https://bot.sannysoft.com/' },
            { name: 'BrowserScan', url: 'https://www.browserscan.net' },
            { name: 'CreepJS', url: 'https://abrahamjuliot.github.io/creepjs/' },
        ]
        try {
            for (const site of sites) {
                try {
                    await slot.page.goto(site.url, { waitUntil: 'networkidle', timeout: 60_000 })
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
        const lines = results.map(r =>
            r.status === 'pass' ? `✅ ${r.site}` : `❌ ${r.site}: ${r.error}`
        )
        await sendMessage(chatId, `*Audit Score: ${passed}/3*\n\n${lines.join('\n')}`)
        return
    }

    if (lower === '/skills') {
        const skills = await loadAllSkills()
        if (skills.length === 0) {
            await sendMessage(chatId, 'No skills forged yet. Use `/forge <intent>` to create one.')
            return
        }
        const list = skills.map((s, i) => `${i + 1}. *${s.name}* — ${s.description}`).join('\n')
        await sendMessage(chatId, `*Skill Registry (${skills.length})*\n\n${list}`)
        return
    }

    if (lower.startsWith('/forge ')) {
        const intent = text.slice(7).trim()
        if (!intent) { await sendMessage(chatId, 'Usage: `/forge <intent>`'); return }
        await sendMessage(chatId, `\`[FORGE]\` Blacksmithing: _${intent}_...`)
        try {
            const skill = await ForgeEngine.blacksmith(intent)
            await sendMessage(chatId,
                `✅ *Skill Forged*\n\n*Name:* ${skill.name}\n*ID:* \`${skill.id}\`\n*Description:* ${skill.description}\n\nDownload: https://gforce.run/api/skills/${skill.id}/download`
            )
        } catch (err) {
            await sendMessage(chatId, `❌ Forge failed: ${(err as Error).message}`)
        }
        return
    }

    if (lower.startsWith('/build ')) {
        const intent = text.slice(7).trim()
        if (!intent) { await sendMessage(chatId, 'Usage: `/build <intent>`'); return }
        await sendMessage(chatId, `\`[BUILD]\` Fabricating: _${intent}_...`)
        try {
            const result = await ForgeEngine.fabricate(intent)
            await sendDocument(chatId, result.filename, result.code, `✅ ${result.description}`)
        } catch (err) {
            await sendMessage(chatId, `❌ Build failed: ${(err as Error).message}`)
        }
        return
    }

    await sendMessage(chatId, 'Unknown command. Send `/help` to see available commands.')
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    // Verify Telegram webhook secret
    const secret = req.headers.get('x-telegram-bot-api-secret-token')
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET
    if (expected && secret !== expected) {
        return new NextResponse(null, { status: 403 })
    }

    // Always return 200 immediately — Telegram retries on non-200
    const update = await req.json().catch(() => null)
    if (!update?.message?.text || !update?.message?.chat?.id) {
        return new NextResponse('ok')
    }

    const chatId: number = update.message.chat.id
    const userId: number = update.message.from?.id ?? chatId
    const text: string = update.message.text

    if (!isAllowed(userId)) {
        await sendMessage(chatId, '⛔ Access denied.')
        return new NextResponse('ok')
    }

    // Handle async — don't await so Telegram gets 200 fast
    handleCommand(chatId, text).catch(err => {
        console.error('[Telegram] command error:', err)
        sendMessage(chatId, `❌ Error: ${(err as Error).message}`).catch(() => {})
    })

    return new NextResponse('ok')
}

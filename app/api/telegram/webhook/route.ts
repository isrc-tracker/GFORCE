import { NextRequest, NextResponse } from 'next/server'
import { ForgeEngine, ensureSkillsLoaded } from '@/lib/automation/forge'
import { loadAllSkills } from '@/lib/automation/skill-store'
import { pool } from '@/lib/automation/pool'
import { skillRegistry } from '@/lib/automation/skills'
import { sendDocument, sendMessage } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

const HELP_TEXT = `*G-Force Remote Commands*

/forge <intent> - Forge a browser automation skill
/build <intent> - Fabricate standalone software
/run <skillId> - Execute a saved skill
/audit - Run stealth fingerprint audit
/skills - List all saved skills
/help - Show this message

*Examples:*
\`/forge scrape top 10 Hacker News titles\`
\`/run amazon-search-top5-headphones\`
\`/build Node.js script to monitor URLs\``

function isAllowed(userId: number): boolean {
    const allowed = process.env.TELEGRAM_ALLOWED_IDS
    if (!allowed || !allowed.trim()) return true
    return allowed.split(',').map(s => s.trim()).includes(String(userId))
}

function safeCodeBlock(text: string, maxLen = 3000): string {
    return text.replace(/```/g, "'`'`'").slice(0, maxLen)
}

function safeInline(text: string, maxLen = 256): string {
    return text
        .replace(/[`*_\\[\]()~>#+\-=|{}.!]/g, '\\$&')
        .slice(0, maxLen)
}

async function handleCommand(chatId: number, text: string): Promise<void> {
    const trimmed = text.trim()
    const lower = trimmed.toLowerCase()

    if (lower === '/help' || lower === '/start') {
        await sendMessage(chatId, HELP_TEXT)
        return
    }

    if (lower === '/audit') {
        await sendMessage(chatId, '`[AUDIT]` Running stealth fingerprint audit... (60-90s)')
        const slot = await pool.acquire(90_000)
        const results: Array<{ site: string; status: 'pass' | 'fail'; title?: string; error?: string }> = []
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
            r.status === 'pass'
                ? `OK ${safeInline(r.site, 64)}`
                : `FAIL ${safeInline(r.site, 64)}: ${safeInline(r.error ?? 'unknown', 160)}`
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

        const list = skills
            .map((s, i) => `${i + 1}. \`${safeInline(s.id, 96)}\` - *${safeInline(s.name, 64)}*\n   ${safeInline(s.description, 160)}`)
            .join('\n')

        await sendMessage(chatId, `*Skill Registry (${skills.length})*\n\n${list}`)
        return
    }

    if (lower.startsWith('/run ')) {
        const skillId = trimmed.slice(5).trim()
        if (!skillId) {
            await sendMessage(chatId, 'Usage: `/run <skillId>`\n\nGet skill IDs with `/skills`')
            return
        }

        await sendMessage(chatId, `\`[EXEC]\` Running skill \`${safeInline(skillId, 96)}\`...`)

        await ensureSkillsLoaded()
        const skill = skillRegistry.get(skillId)
        if (!skill) {
            await sendMessage(chatId, `FAIL Skill \`${safeInline(skillId, 96)}\` not found. Use \`/skills\` to list available skills.`)
            return
        }

        const slot = await pool.acquire(60_000)
        try {
            const result = await skill.execute({ page: slot.page, context: slot.context })
            const json = typeof result === 'string' ? result : (JSON.stringify(result, null, 2) ?? String(result))
            const preview = json.length > 3000
                ? `${safeCodeBlock(json, 3000)}\n...(truncated)`
                : safeCodeBlock(json, 3000)

            await sendMessage(
                chatId,
                `OK *${safeInline(skill.name, 64)}* complete\n\n\`\`\`\n${preview}\n\`\`\``
            )
        } catch (err) {
            await sendMessage(chatId, `FAIL Execution failed: ${safeInline((err as Error).message, 200)}`)
        } finally {
            await slot.release()
        }
        return
    }

    if (lower.startsWith('/forge ')) {
        const intent = trimmed.slice(7).trim()
        if (!intent) {
            await sendMessage(chatId, 'Usage: `/forge <intent>`')
            return
        }

        await sendMessage(chatId, `\`[FORGE]\` Blacksmithing: _${safeInline(intent, 120)}_...`)
        try {
            const skill = await ForgeEngine.blacksmith(intent)
            await sendMessage(
                chatId,
                `OK *Skill Forged*\n\n*Name:* ${safeInline(skill.name, 64)}\n*ID:* \`${safeInline(skill.id, 96)}\`\n*Description:* ${safeInline(skill.description, 200)}\n\nDownload: https://gforce.run/api/skills/${encodeURIComponent(skill.id)}/download`
            )
        } catch (err) {
            await sendMessage(chatId, `FAIL Forge failed: ${safeInline((err as Error).message, 200)}`)
        }
        return
    }

    if (lower.startsWith('/build ')) {
        const intent = trimmed.slice(7).trim()
        if (!intent) {
            await sendMessage(chatId, 'Usage: `/build <intent>`')
            return
        }

        await sendMessage(chatId, `\`[BUILD]\` Fabricating: _${safeInline(intent, 120)}_...`)
        try {
            const result = await ForgeEngine.fabricate(intent)
            await sendDocument(chatId, result.filename, result.code, `OK ${safeInline(result.description, 200)}`)
        } catch (err) {
            await sendMessage(chatId, `FAIL Build failed: ${safeInline((err as Error).message, 200)}`)
        }
        return
    }

    await sendMessage(chatId, 'Unknown command. Send `/help` to see available commands.')
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const secret = req.headers.get('x-telegram-bot-api-secret-token')
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET
    if (expected && secret !== expected) {
        return new NextResponse(null, { status: 403 })
    }

    const update = await req.json().catch(() => null)
    if (!update?.message?.text || !update?.message?.chat?.id) {
        return new NextResponse('ok')
    }

    const chatId: number = update.message.chat.id
    const userId: number = update.message.from?.id ?? chatId
    const text: string = update.message.text

    if (!isAllowed(userId)) {
        await sendMessage(chatId, 'Access denied.')
        return new NextResponse('ok')
    }

    handleCommand(chatId, text).catch(err => {
        console.error('[Telegram] command error:', err)
        sendMessage(chatId, `FAIL Error: ${safeInline((err as Error).message, 200)}`).catch(() => {})
    })

    return new NextResponse('ok')
}

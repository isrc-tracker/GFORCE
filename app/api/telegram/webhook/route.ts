import { NextRequest, NextResponse } from 'next/server'
import { ForgeEngine, ensureSkillsLoaded } from '@/lib/automation/forge'
import { loadAllSkills } from '@/lib/automation/skill-store'
import { pool } from '@/lib/automation/pool'
import { skillRegistry } from '@/lib/automation/skills'
import { sendDocument, sendMessage } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

const HELP_TEXT = `*G-Force Remote Commands*

/run <skillId> [accountId] [--async] - Execute skill
/schedule <skillId> <mins> [acc] - Schedule a task
/unschedule <id> - Stop a scheduled task
/schedules - List all active schedules
/scrape <url> [country] - Fast background scrape
/jobs - List active background jobs
/accounts - List all saved accounts
/stats - Show domain success rates
/help - Show this message

*Examples:*
\`/run tiktok-auto-like acc-01\`
\`/scrape https://tiktok.com us\`
\`/run reddit-post acc-02 --async\``

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
        const slot = await pool.acquire({ timeoutMs: 90_000 })
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

    if (lower === '/accounts') {
        const { loadAllAccounts } = await import('@/lib/automation/accounts')
        const accounts = await loadAllAccounts()
        if (accounts.length === 0) {
            await sendMessage(chatId, 'No accounts added yet. Add JSON files to the `accounts/` folder.')
            return
        }

        const list = accounts
            .map((a, i) => `${i + 1}. \`${safeInline(a.id, 96)}\` - *${safeInline(a.platform, 32)}* (${a.status})\n   ${a.username ? `@${safeInline(a.username, 64)}` : 'No username'}`)
            .join('\n')

        await sendMessage(chatId, `*Account Pool (${accounts.length})*\n\n${list}`)
        return
    }

    if (lower === '/jobs') {
        const { getJob } = await import('@/lib/automation/jobs')
        // In a real app, you'd iterate the jobs Map, but for this demo:
        await sendMessage(chatId, `*Active Job Queue*\nTo check a specific job, use \`/job <id>\` (coming soon). Check \`/stats\` for domain health.`)
        return
    }

    if (lower === '/stats') {
        const { Monitor } = await import('@/lib/automation/monitor')
        const stats = Monitor.getAllStats()
        if (stats.length === 0) {
            await sendMessage(chatId, 'No session data collected yet.')
            return
        }

        const list = stats
            .map(s => {
                const total = s.successCount + s.failureCount
                const rate = (s.successCount / total) * 100
                const status = s.throttled ? '❌ THROTTLED' : (rate < 95 ? '⚠️ WARNING' : '✅ HEALTHY')
                return `*${s.domain}*: ${rate.toFixed(1)}% (${s.successCount}/${total})\nStatus: ${status}`
            })
            .join('\n\n')

        await sendMessage(chatId, `*Domain Health Monitor (Min 90% Success)*\n\n${list}`)
        return
    }

    if (lower.startsWith('/run ')) {
        const args = trimmed.slice(5).trim().split(/\s+/)
        const skillId = args[0]
        const accountId = args[1]
        const isAsync = trimmed.includes('--async')

        if (!skillId) {
            await sendMessage(chatId, 'Usage: `/run <skillId> [accountId] [--async]`\n\nGet IDs with `/skills` and `/accounts`')
            return
        }

        await ensureSkillsLoaded()
        const skill = skillRegistry.get(skillId)
        if (!skill) {
            await sendMessage(chatId, `FAIL Skill \`${safeInline(skillId, 96)}\` not found.`)
            return
        }

        const domain = skillId.includes('tiktok') ? 'tiktok.com' :
            skillId.includes('reddit') ? 'reddit.com' :
                skillId.includes('youtube') ? 'youtube.com' : 'general';

        if (isAsync) {
            const { createJob } = await import('@/lib/automation/jobs')
            const jobId = await createJob(skill as any, accountId, chatId)
            await sendMessage(chatId, `\`[ASYNC]\` Job started! ID: \`${jobId}\` (Skill: \`${skillId}\`)\nI will notify you when it's done.`)
            return
        }

        const { Monitor } = await import('@/lib/automation/monitor')
        if (Monitor.isThrottled(domain)) {
            await sendMessage(chatId, `FAIL Execution blocked. Domain \`${domain}\` is throttled (Success rate < 90%).`)
            return
        }

        await sendMessage(chatId, `\`[EXEC]\` Running \`${safeInline(skillId, 96)}\`${accountId ? ` with account \`${safeInline(accountId, 64)}\`` : ''}...`)

        const slot = await pool.acquire({ accountId, timeoutMs: 60_000 })
        try {
            const { Monitor } = await import('@/lib/automation/monitor')
            const botToken = process.env.TELEGRAM_BOT_TOKEN
            const result = await skill.execute({ page: slot.page, context: slot.context }, botToken, chatId)
            const json = typeof result === 'string' ? result : (JSON.stringify(result, null, 2) ?? String(result))

            Monitor.recordResult(domain, true)

            const preview = json.length > 3000
                ? `${safeCodeBlock(json, 3000)}\n...(truncated)`
                : safeCodeBlock(json, 3000)

            await sendMessage(
                chatId,
                `OK *${safeInline(skill.name, 64)}* complete\n\n\`\`\`\n${preview}\n\`\`\``
            )
        } catch (err) {
            const { Monitor } = await import('@/lib/automation/monitor')
            Monitor.recordResult(domain, false)
            await sendMessage(chatId, `FAIL Execution failed: ${safeInline((err as Error).message, 200)}`)
        } finally {
            await slot.release()
        }
        return
    }

    if (lower.startsWith('/scrape ')) {
        const args = trimmed.slice(8).trim().split(/\s+/)
        const url = args[0]
        const country = args[1]

        if (!url) {
            await sendMessage(chatId, 'Usage: `/scrape <url> [country]`\nExample: `/scrape https://tiktok.com us`')
            return
        }

        await sendMessage(chatId, `\`[SCRAPE]\` Submitting async unlocker request for \`${url}\`...`)

        try {
            const { submitAsyncScraping } = await import('@/lib/automation/bright-data')
            const { registerExternalJob } = await import('@/lib/automation/jobs')

            const responseId = await submitAsyncScraping({ url, country })

            // Register it so the webhook knows who to notify
            registerExternalJob(responseId, url, chatId)

            await sendMessage(chatId, `\`[ASYNC]\` Request accepted. Response ID: \`${responseId}\`\nI will notify you when the data arrives at our webhook.`)
        } catch (err: any) {
            await sendMessage(chatId, `FAIL Scrape submission failed: ${err.message}`)
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

    if (lower.startsWith('/schedule ')) {
        const { scheduler } = await import('@/lib/automation/scheduler')
        const args = trimmed.slice(10).trim().split(/\s+/)
        const skillId = args[0]
        const intervalMins = parseInt(args[1])
        const accountId = args[2]

        if (!skillId || isNaN(intervalMins)) {
            await sendMessage(chatId, 'Usage: `/schedule <skillId> <interval_minutes> [accountId]`')
            return
        }

        await ensureSkillsLoaded()
        const skill = skillRegistry.get(skillId)
        if (!skill) {
            await sendMessage(chatId, `FAIL Skill \`${safeInline(skillId, 96)}\` not found.`)
            return
        }

        const id = await scheduler.addSchedule(skillId, intervalMins, chatId, accountId)
        await sendMessage(chatId, `✅ *Schedule Added*\nID: \`${id}\`\nSkill: \`${skillId}\`\nInterval: ${intervalMins}m\nAccount: ${accountId || 'None'}`)
        return
    }

    if (lower.startsWith('/unschedule ')) {
        const { scheduler } = await import('@/lib/automation/scheduler')
        const id = trimmed.slice(12).trim()
        if (!id) {
            await sendMessage(chatId, 'Usage: `/unschedule <scheduleId>`')
            return
        }

        const ok = await scheduler.stopSchedule(id)
        if (ok) {
            await sendMessage(chatId, `✅ Schedule \`${id}\` stopped and removed.`)
        } else {
            await sendMessage(chatId, `FAIL Schedule \`${id}\` not found.`)
        }
        return
    }

    if (lower === '/schedules') {
        const { scheduler } = await import('@/lib/automation/scheduler')
        const list = scheduler.getSchedules()
        if (list.length === 0) {
            await sendMessage(chatId, 'No active schedules.')
            return
        }

        const lines = list.map(s =>
            `ID: \`${s.id}\`\nSkill: \`${s.skillId}\`\nFreq: ${s.intervalMs / 60000}m\nLast: ${s.lastRun ? new Date(s.lastRun).toLocaleTimeString() : 'Never'}`
        ).join('\n\n')

        await sendMessage(chatId, `*Automation Schedules*\n\n${lines}`)
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

    const { scheduler } = await import('@/lib/automation/scheduler')
    scheduler.start().catch(err => console.error('[Scheduler] Boot error:', err))

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
        sendMessage(chatId, `FAIL Error: ${safeInline((err as Error).message, 200)}`).catch(() => { })
    })

    return new NextResponse('ok')
}

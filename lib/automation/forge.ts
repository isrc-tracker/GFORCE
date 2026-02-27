import { executeWithClaude } from './ai-client'
import { skillRegistry, Skill, SkillContext, BaseSkill } from './skills'
import { saveSkill, loadAllSkills, StoredSkill } from './skill-store'
import { promises as fs } from 'fs'
import path from 'path'

// ─── Security: patterns forbidden inside AI-generated executeBody ───────────
const FORBIDDEN = [
    /require\s*\(/,
    /\bimport\s*\(/,
    /\bprocess\s*[.[]/,   // process.env, process['env'] — not the word in comments
    /child_process/,
    /\bexec\s*\(/,
    /\bspawn\s*\(/,
    /\beval\s*\(/,
    /new\s+Function\s*\(/,
    /__dirname/,
    /__filename/,
    /\bfs\s*\./,
    /\bglobal\s*[.[]/,    // global.x or global['x'] — not variable names like globalVar
    /\bBuffer\s*[.([]/,   // Buffer.from(), Buffer(), new Buffer
]

/** Strip JS line/block comments before pattern checking to avoid false positives */
function stripComments(code: string): string {
    return code
        .replace(/\/\/[^\n]*/g, '')        // line comments
        .replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
}

function validateExecuteBody(body: string): void {
    if (body.length > 50_000) throw new Error('executeBody exceeds 50,000 char limit')
    const stripped = stripComments(body)
    for (const pattern of FORBIDDEN) {
        if (pattern.test(stripped)) {
            throw new Error(`Security violation: forbidden pattern detected in executeBody`)
        }
    }
}

// ─── DynamicSkill ────────────────────────────────────────────────────────────

export class DynamicSkill extends BaseSkill {
    private executeFn: Function

    constructor(
        public id: string,
        public name: string,
        public description: string,
        executeBody: string
    ) {
        super()
        validateExecuteBody(executeBody)
        // Use safe string concatenation to avoid template literal injection from executeBody
        const body =
            'return (async () => {\n' +
            '    const { page, context } = ctx;\n' +
            executeBody + '\n' +
            '})();'
        try {
            this.executeFn = new Function('ctx', 'botToken', 'chatId', '...args', body)
        } catch (err) {
            console.error('[Forge] CRITICAL: Invalid code generated in executeBody')
            console.error('--- START FAILED BODY ---')
            console.error(body)
            console.error('--- END FAILED BODY ---')
            throw err
        }
    }

    async execute(ctx: SkillContext, botToken?: string, chatId?: number, ...args: any[]): Promise<any> {
        return this.executeFn(ctx, botToken, chatId, ...args)
    }
}

// ─── Startup: load persisted skills into registry once ──────────────────────

let _loaded = false
export async function ensureSkillsLoaded(): Promise<void> {
    if (_loaded) return
    _loaded = true
    const stored = await loadAllSkills()
    for (const s of stored) {
        try {
            const skill = new DynamicSkill(s.id, s.name, s.description, s.executeBody)
            skillRegistry.register(skill)
        } catch (err) {
            console.warn(`[Forge] Skipping invalid stored skill '${s.id}':`, (err as Error).message)
        }
    }
    if (stored.length > 0) {
        console.log(`[Forge] Loaded ${stored.length} persisted skill(s) from disk.`)
    }
}

// ─── ForgeEngine ─────────────────────────────────────────────────────────────

const TOOLS_DIR = path.join(process.cwd(), 'tools')

async function ensureToolsDir() {
    await fs.mkdir(TOOLS_DIR, { recursive: true })
}

function sanitizeInput(s: string, maxLen: number): string {
    return s.slice(0, maxLen).replace(/[<>]/g, '')
}

function findBalancedObjectEnd(text: string, start: number): number {
    let depth = 0
    let inString = false
    let escaped = false

    for (let i = start; i < text.length; i++) {
        const ch = text[i]

        if (inString) {
            if (escaped) {
                escaped = false
                continue
            }
            if (ch === '\\') {
                escaped = true
                continue
            }
            if (ch === '"') {
                inString = false
            }
            continue
        }

        if (ch === '"') {
            inString = true
            continue
        }
        if (ch === '{') {
            depth++
            continue
        }
        if (ch === '}') {
            depth--
            if (depth === 0) return i
        }
    }

    return -1
}

function extractJsonObjectCandidates(text: string): string[] {
    const out: string[] = []
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== '{') continue
        const end = findBalancedObjectEnd(text, i)
        if (end !== -1) {
            out.push(text.slice(i, end + 1))
        }
    }
    return out
}

function repairJson(json: string): string {
    let repaired = json.trim()

    // 1. Handle unescaped newlines in strings (common Claude error)
    // This finds a quote, then non-quote characters (including newlines), then a quote
    // and replaces actual newlines with \n
    repaired = repaired.replace(/"([^"]*)"/g, (match, p1) => {
        return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"'
    })

    // 2. Close truncated JSON
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = 0; i < repaired.length; i++) {
        const ch = repaired[i]
        if (inString) {
            if (escaped) escaped = false
            else if (ch === '\\') escaped = true
            else if (ch === '"') inString = false
        } else {
            if (ch === '"') inString = true
            else if (ch === '{') depth++
            else if (ch === '}') depth--
        }
    }

    if (inString) repaired += '"'
    while (depth > 0) {
        repaired += '}'
        depth--
    }

    return repaired
}

function parseJsonObjectFromModel(response: string): any {
    const trimmed = response.replace(/^\uFEFF/, '').trim()

    // Attempt 1: Standard fenced block
    const jsonRegex = /```(?:json)?\s*([\s\S]*?)```/gi
    let matches = Array.from(trimmed.matchAll(jsonRegex))

    // Attempt 2: If no fenced blocks, check for everything from the first { to the last }
    if (matches.length === 0) {
        const firstBrace = trimmed.indexOf('{')
        const lastBrace = trimmed.lastIndexOf('}')
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            matches = [[null, trimmed.slice(firstBrace, lastBrace + 1)]] as any
        }
    }

    const pools = matches.length > 0 ? matches.map(m => m[1].trim()) : [trimmed]
    let bestCandidate: any = null
    let lastErr: Error | null = null

    for (const pool of pools) {
        // Try raw first, then repair
        const candidates = extractJsonObjectCandidates(pool)
        for (const candidate of candidates) {
            try {
                const parsed = JSON.parse(candidate)
                if (parsed.executeBody || parsed.code) return parsed
                if (!bestCandidate) bestCandidate = parsed
            } catch {
                try {
                    const repaired = repairJson(candidate)
                    const parsed = JSON.parse(repaired)
                    if (parsed.executeBody || parsed.code) return parsed
                    if (!bestCandidate) bestCandidate = parsed
                } catch (err) {
                    lastErr = err as Error
                }
            }
        }
    }

    if (bestCandidate) return bestCandidate
    if (lastErr) throw lastErr
    throw new Error('No valid JSON found in Forge response')
}

export class ForgeEngine {
    /**
     * Blacksmith — forge a new browser-automation Skill from a natural-language intent.
     * Validates AI-generated code before executing. Persists to disk automatically.
     */
    static async blacksmith(intent: string, context?: string): Promise<Skill> {
        await ensureSkillsLoaded()

        const safeIntent = sanitizeInput(intent, 2000)
        const safeContext = sanitizeInput(context ?? 'General web automation', 1000)

        console.log(`[Forge] Blacksmithing skill for: "${safeIntent}"`)

        const systemPrompt = `You are the G-Force Forge, a specialized AI that generates Playwright browser automation skills.
Output ONLY a valid JSON object with these exact fields:
- id: unique kebab-case string (e.g. "extract-emails")
- name: human-readable name
- description: what this skill does
- executeBody: the RAW JavaScript body of an async function.

  CRITICAL GUIDELINES for executeBody:
  - **Context Variables**: Use \`page\`, \`context\`, \`botToken\`, \`chatId\`, and \`args\`.
  - **Content Quality**: When scraping news, explicitly EXCLUDE job postings and ads.
  - **Robust Data Fetching**: ALWAYS verify response types before parsing.
  - **Telegram Reporting**: Use the provided \`botToken\` and \`chatId\` to send updates.
  - **Error Handling**: Use try-catch blocks everywhere.

Example:
{
  "id": "get-title",
  "name": "Titler",
  "description": "Gets page title",
  "executeBody": "try { return await page.title(); } catch (e) { console.error(e); }"
}`

        const prompt = `Intent: ${safeIntent}\nContext: ${safeContext}\n\nForge the Skill JSON:`
        const botToken = process.env.TELEGRAM_BOT_TOKEN
        const chatId = process.env.TELEGRAM_CHAT_ID ? Number(process.env.TELEGRAM_CHAT_ID) : undefined

        try {
            const response = await executeWithClaude(prompt, systemPrompt)
            let data: any
            try {
                data = parseJsonObjectFromModel(response)
            } catch (err) {
                console.error('[Forge] ❌ JSON Parsing Failed')
                console.log('--- START RAW AI RESPONSE ---')
                console.log(response)
                console.log('--- END RAW AI RESPONSE ---')
                throw err
            }

            // Smarter field mapping with fallbacks
            const body = data.executeBody || data.execute_body || data.code || data.script || data.automation_code
            let id = data.id || data.skillId || data.skill_id
            let name = data.name || data.skillName || data.skill_name || intent.slice(0, 32)
            let desc = data.description || data.desc || data.about

            if (!body) {
                console.error('[Forge] ❌ Missing script body in AI response. Keys found:', Object.keys(data))
                console.log('--- RAW AI RESPONSE ---')
                console.log(response)
                throw new Error('Incomplete skill schema: script body is missing')
            }

            // Fallbacks for metadata if code is present
            if (!id) id = `skill-${Math.random().toString(36).slice(2, 8)}`
            if (!name) name = `Forged Skill ${id}`
            if (!desc) desc = `AI-generated skill for: ${safeIntent}`

            data.id = id
            data.name = name
            data.description = desc
            data.executeBody = body

            // Sanitize ID — no path traversal or injection
            data.id = String(data.id).replace(/[^\w\-]/g, '-').toLowerCase().slice(0, 64)

            // validateExecuteBody runs inside DynamicSkill constructor
            const skill = new DynamicSkill(data.id, data.name, data.description, data.executeBody)
            skillRegistry.register(skill)

            const stored: StoredSkill = {
                id: skill.id,
                name: skill.name,
                description: skill.description,
                executeBody: data.executeBody,
                createdAt: new Date().toISOString(),
            }
            await saveSkill(stored)
            console.log(`[Forge] ✅ Skill '${skill.name}' validated, registered, persisted.`)
            return skill
        } catch (err) {
            const msg = (err as Error).message
            console.error('[Forge] ❌ Blacksmithing failed:', msg)
            throw err
        }
    }

    /**
     * Fabricate — generate a complete standalone Node.js/TypeScript/Python/Bash tool
     * from a natural-language description. Saves to tools/ directory. Fully downloadable.
     */
    static async fabricate(
        intent: string,
        context?: string
    ): Promise<{ filename: string; code: string; description: string }> {
        const safeIntent = sanitizeInput(intent, 3000)
        const safeContext = sanitizeInput(context ?? '', 1000)

        console.log(`[Forge] Fabricating software: "${safeIntent}"`)
        await ensureToolsDir()

        const systemPrompt = `You are the G-Force Software Fabricator — an AI that writes complete, production-ready programs.
Output ONLY a valid JSON object with these exact fields:
- filename: file name with appropriate extension (.ts, .js, .py, .sh, etc.)
- description: one-sentence description of what this tool does
- code: the COMPLETE source code as a string. Include all imports. Handle errors. The code must be runnable as-is.

CRITICAL GUIDELINES:
- **Robustness**: Always handle potential network errors, non-JSON responses from APIs, and malformed data. Use try-catch blocks and explicit response validation.
- **Completeness**: No placeholders. No TODOs.
- **Available packages (Node.js)**: axios, playwright, zod, @anthropic-ai/sdk, openai, cheerio, fs, path, crypto, http, https.

Write clean, complete, commented code. Make it fully functional.

Example:
{
  "filename": "scrape-headlines.ts",
  "description": "Fetches and prints top 10 HackerNews headlines",
  "code": "import axios from 'axios';\\n\\nasync function main() {\\n  const { data: ids } = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json');\\n  for (const id of ids.slice(0, 10)) {\\n    const { data: s } = await axios.get(\`https://hacker-news.firebaseio.com/v0/item/\${id}.json\`);\\n    console.log(\`[\${s.score}] \${s.title}\`);\\n  }\\n}\\nmain().catch(console.error);"
}`

        const prompt = `Build me: ${safeIntent}\nContext: ${safeContext || 'None'}\n\nFabricate the software JSON:`

        try {
            const response = await executeWithClaude(prompt, systemPrompt, 8192)
            const data = parseJsonObjectFromModel(response)
            if (!data.filename || !data.code) throw new Error('Incomplete software schema')

            // Sanitize filename — prevent path traversal
            const safeFilename = path.basename(String(data.filename))
                .replace(/[^a-zA-Z0-9.\-_]/g, '-')
                .slice(0, 128)

            const filePath = path.join(TOOLS_DIR, safeFilename)
            await fs.writeFile(filePath, data.code, 'utf-8')
            console.log(`[Forge] ✅ Software '${safeFilename}' saved to tools/`)

            return {
                filename: safeFilename,
                description: String(data.description ?? '').slice(0, 256),
                code: data.code,
            }
        } catch (err) {
            console.error('[Forge] ❌ Fabrication failed:', (err as Error).message)
            throw err
        }
    }
}

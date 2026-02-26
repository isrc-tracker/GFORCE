import { executeWithClaude } from './ai-client'
import { skillRegistry, Skill, SkillContext, BaseSkill } from './skills'
import { saveSkill, loadAllSkills, StoredSkill } from './skill-store'
import { promises as fs } from 'fs'
import path from 'path'

// ─── Security: patterns forbidden inside AI-generated executeBody ───────────
const FORBIDDEN = [
    /require\s*\(/,
    /\bimport\s*\(/,
    /\bprocess\b/,
    /child_process/,
    /\bexec\s*\(/,
    /\bspawn\s*\(/,
    /\beval\s*\(/,
    /new\s+Function\s*\(/,
    /__dirname/,
    /__filename/,
    /\bfs\s*\./,
    /\bglobal\b/,
    /\bBuffer\b/,
]

function validateExecuteBody(body: string): void {
    if (body.length > 50_000) throw new Error('executeBody exceeds 50,000 char limit')
    for (const pattern of FORBIDDEN) {
        if (pattern.test(body)) {
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
        this.executeFn = new Function('ctx', '...args', `
            return (async () => {
                const { page, context } = ctx;
                ${executeBody}
            })();
        `)
    }

    async execute(ctx: SkillContext, ...args: any[]): Promise<any> {
        return this.executeFn(ctx, ...args)
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

export class ForgeEngine {
    /**
     * Blacksmith — forge a new browser-automation Skill from a natural-language intent.
     * Validates AI-generated code before executing. Persists to disk automatically.
     */
    static async blacksmith(intent: string, context?: string): Promise<Skill | null> {
        await ensureSkillsLoaded()

        const safeIntent = sanitizeInput(intent, 2000)
        const safeContext = sanitizeInput(context ?? 'General web automation', 1000)

        console.log(`[Forge] Blacksmithing skill for: "${safeIntent}"`)

        const systemPrompt = `You are the G-Force Forge, a specialized AI that generates Playwright browser automation skills.
Output ONLY a valid JSON object with these exact fields:
- id: unique kebab-case string, max 64 chars (e.g. "extract-emails")
- name: human-readable name, max 64 chars
- description: what this skill does, max 256 chars
- executeBody: the RAW JavaScript body of an async function.
  You have access to: page (Playwright Page), context (Playwright BrowserContext), args (array).
  FORBIDDEN: require(), import(), process, fs, eval, exec, spawn, child_process, Buffer, global, __dirname, __filename, new Function().
  ONLY use Playwright page/context APIs and standard browser JavaScript.

Example:
{
  "id": "get-page-title",
  "name": "Page Titler",
  "description": "Returns the current page title",
  "executeBody": "return await page.title();"
}`

        const prompt = `Intent: ${safeIntent}\nContext: ${safeContext}\n\nForge the Skill JSON:`

        try {
            const response = await executeWithClaude(prompt, systemPrompt)
            const jsonMatch = response.match(/\{[\s\S]*\}/)
            if (!jsonMatch) throw new Error('No JSON found in Forge response')

            const data = JSON.parse(jsonMatch[0])
            if (!data.id || !data.name || !data.description || !data.executeBody) {
                throw new Error('Incomplete skill schema in AI response')
            }

            // Sanitize ID — no path traversal or injection
            data.id = String(data.id).replace(/[^\w\-]/g, '-').slice(0, 64)

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
            console.error('[Forge] ❌ Blacksmithing failed:', msg.startsWith('Security') ? 'code validation rejected' : msg)
            return null
        }
    }

    /**
     * Fabricate — generate a complete standalone Node.js/TypeScript/Python/Bash tool
     * from a natural-language description. Saves to tools/ directory. Fully downloadable.
     */
    static async fabricate(
        intent: string,
        context?: string
    ): Promise<{ filename: string; code: string; description: string } | null> {
        const safeIntent = sanitizeInput(intent, 3000)
        const safeContext = sanitizeInput(context ?? '', 1000)

        console.log(`[Forge] Fabricating software: "${safeIntent}"`)
        await ensureToolsDir()

        const systemPrompt = `You are the G-Force Software Fabricator — an AI that writes complete, production-ready programs.
Output ONLY a valid JSON object with these exact fields:
- filename: file name with appropriate extension (.ts, .js, .py, .sh, etc.)
- description: one-sentence description of what this tool does
- code: the COMPLETE source code as a string. Include all imports. Handle errors. The code must be runnable as-is.

Supported runtimes: Node.js (TypeScript via tsx, or plain JS), Python 3, Bash.
Available packages (Node.js): axios, playwright, zod, @anthropic-ai/sdk, openai, cheerio, fs, path, crypto, http, https.

Write clean, complete, commented code. No placeholders. No TODOs. Make it fully functional.

Example:
{
  "filename": "scrape-headlines.ts",
  "description": "Fetches and prints top 10 HackerNews headlines",
  "code": "import axios from 'axios';\\n\\nasync function main() {\\n  const { data: ids } = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json');\\n  for (const id of ids.slice(0, 10)) {\\n    const { data: s } = await axios.get(\`https://hacker-news.firebaseio.com/v0/item/\${id}.json\`);\\n    console.log(\`[\${s.score}] \${s.title}\`);\\n  }\\n}\\nmain().catch(console.error);"
}`

        const prompt = `Build me: ${safeIntent}\nContext: ${safeContext || 'None'}\n\nFabricate the software JSON:`

        try {
            const response = await executeWithClaude(prompt, systemPrompt, 8192)
            const jsonMatch = response.match(/\{[\s\S]*\}/)
            if (!jsonMatch) throw new Error('No JSON in fabrication response')

            const data = JSON.parse(jsonMatch[0])
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
            return null
        }
    }
}

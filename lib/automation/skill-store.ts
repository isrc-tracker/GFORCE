import { promises as fs } from 'fs'
import path from 'path'

const SKILLS_DIR = path.join(process.cwd(), 'skills')

export interface StoredSkill {
    id: string
    name: string
    description: string
    executeBody: string
    createdAt: string
}

async function ensureDir() {
    await fs.mkdir(SKILLS_DIR, { recursive: true })
}

export async function saveSkill(skill: StoredSkill): Promise<void> {
    await ensureDir()
    await fs.writeFile(
        path.join(SKILLS_DIR, `${skill.id}.json`),
        JSON.stringify(skill, null, 2),
        'utf-8'
    )
}

export async function loadAllSkills(): Promise<StoredSkill[]> {
    try {
        await ensureDir()
        const files = await fs.readdir(SKILLS_DIR)
        const results = await Promise.allSettled(
            files
                .filter(f => f.endsWith('.json'))
                .map(async f => {
                    const content = await fs.readFile(path.join(SKILLS_DIR, f), 'utf-8')
                    return JSON.parse(content) as StoredSkill
                })
        )
        return results
            .filter((r): r is PromiseFulfilledResult<StoredSkill> => r.status === 'fulfilled')
            .map(r => r.value)
    } catch {
        return []
    }
}

export async function deleteSkill(id: string): Promise<void> {
    const safe = path.basename(id)
    await fs.unlink(path.join(SKILLS_DIR, `${safe}.json`)).catch(() => {})
}

export async function getSkill(id: string): Promise<StoredSkill | null> {
    try {
        const safe = path.basename(id)
        const content = await fs.readFile(path.join(SKILLS_DIR, `${safe}.json`), 'utf-8')
        return JSON.parse(content)
    } catch {
        return null
    }
}

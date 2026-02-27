import { promises as fs } from 'fs'
import path from 'path'

const ACCOUNTS_DIR = path.join(process.cwd(), 'accounts')

export interface Account {
    id: string; // unique identifier
    platform: 'tiktok' | 'reddit' | 'youtube' | 'other';
    username?: string;
    password?: string;
    cookies?: any[]; // Playwright cookies array
    proxy?: string;  // Account-specific proxy if needed
    metadata?: Record<string, any>;
    status: 'active' | 'banned' | 'suspicious' | 'idle';
    lastUsed?: string;
    createdAt: string;
}

async function ensureDir() {
    await fs.mkdir(ACCOUNTS_DIR, { recursive: true })
}

export async function saveAccount(account: Account): Promise<void> {
    await ensureDir()
    await fs.writeFile(
        path.join(ACCOUNTS_DIR, `${account.id}.json`),
        JSON.stringify(account, null, 2),
        'utf-8'
    )
}

export async function loadAllAccounts(): Promise<Account[]> {
    try {
        await ensureDir()
        const files = await fs.readdir(ACCOUNTS_DIR)
        const results = await Promise.allSettled(
            files
                .filter(f => f.endsWith('.json'))
                .map(async f => {
                    const content = await fs.readFile(path.join(ACCOUNTS_DIR, f), 'utf-8')
                    return JSON.parse(content) as Account
                })
        )
        return results
            .filter((r): r is PromiseFulfilledResult<Account> => r.status === 'fulfilled')
            .map(r => r.value)
    } catch {
        return []
    }
}

export async function getAccount(id: string): Promise<Account | null> {
    try {
        const safe = path.basename(id)
        const content = await fs.readFile(path.join(ACCOUNTS_DIR, `${safe}.json`), 'utf-8')
        return JSON.parse(content) as Account
    } catch {
        return null
    }
}

export async function deleteAccount(id: string): Promise<void> {
    const safe = path.basename(id)
    await fs.unlink(path.join(ACCOUNTS_DIR, `${safe}.json`)).catch(() => { })
}

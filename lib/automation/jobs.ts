import { Skill } from './skills';
import { pool } from './pool';
import { logger } from '../logger';
import { Monitor } from './monitor';
import { sendMessage } from '../telegram';

export interface Job {
    id: string;
    skillId: string;
    accountId?: string;
    domain?: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'throttled';
    result?: any;
    error?: string;
    createdAt: string;
    completedAt?: string;
    chatId?: number; // Store chatId to notify back
}

const jobs = new Map<string, Job>();

export async function createJob(skill: Skill, accountId?: string, chatId?: number): Promise<string> {
    const jobId = Math.random().toString(36).substring(7);
    const job: Job = {
        id: jobId,
        skillId: skill.id,
        accountId,
        chatId,
        status: 'pending',
        createdAt: new Date().toISOString(),
    };
    jobs.set(jobId, job);

    // Start execution in background (asynchronous)
    processJob(job, skill);

    return jobId;
}

/**
 * Registers a job that is being handled by an external provider (like Bright Data Web Unlocker).
 */
export function registerExternalJob(externalId: string, skillId: string, chatId: number, accountId?: string) {
    const job: Job = {
        id: externalId,
        skillId: skillId,
        accountId,
        chatId,
        status: 'running',
        createdAt: new Date().toISOString(),
    };
    jobs.set(externalId, job);
    logger.info(`[JobManager] Registered external async job: ${externalId}`);
}

async function processJob(job: Job, skill: any) {
    // Basic domain inference (can be refined per skill)
    const domain = job.skillId.includes('tiktok') ? 'tiktok.com' :
        job.skillId.includes('reddit') ? 'reddit.com' :
            job.skillId.includes('youtube') ? 'youtube.com' : 'general';
    job.domain = domain;

    if (Monitor.isThrottled(domain)) {
        job.status = 'throttled';
        job.error = `Domain ${domain} is throttled due to low success rate (< 90%).`;
        await notifyJobCompletion(job);
        return;
    }

    job.status = 'running';
    logger.info(`[JobManager] Starting async job ${job.id} (Skill: ${job.skillId}, Domain: ${domain})`);

    try {
        const slot = await pool.acquire({ accountId: job.accountId, timeoutMs: 120_000 });
        try {
            const result = await skill.execute({ page: slot.page, context: slot.context });
            job.status = 'completed';
            job.result = result;
            job.completedAt = new Date().toISOString();

            Monitor.recordResult(domain, true);
            await notifyJobCompletion(job);
        } finally {
            await slot.release();
        }
    } catch (err: any) {
        job.status = 'failed';
        job.error = err.message || String(err);
        job.completedAt = new Date().toISOString();

        Monitor.recordResult(domain, false);
        await notifyJobCompletion(job);
    }
}

async function notifyJobCompletion(job: Job) {
    if (!job.chatId) return;

    logger.info(`[JobManager] Job ${job.id} ${job.status}`);

    let message = '';
    if (job.status === 'completed') {
        const resultString = typeof job.result === 'string' ? job.result : JSON.stringify(job.result, null, 2);
        message = `✅ *Job Complete* (\`${job.id}\`)\nSkill: \`${job.skillId}\`\n\nResult:\n\`\`\`json\n${resultString.slice(0, 1000)}\n\`\`\``;
    } else if (job.status === 'failed') {
        message = `❌ *Job Failed* (\`${job.id}\`)\nSkill: \`${job.skillId}\`\n\nError: ${job.error}`;
    } else if (job.status === 'throttled') {
        message = `⚠️ *Job Throttled* (\`${job.id}\`)\nSkill: \`${job.skillId}\`\n\n${job.error}`;
    }

    if (message) {
        await sendMessage(job.chatId, message);
    }
}

export function getJob(id: string): Job | undefined {
    return jobs.get(id);
}

import { promises as fs } from 'fs';
import path from 'path';
import { createJob } from './jobs';
import { skillRegistry } from './skills';
import { ensureSkillsLoaded } from './forge';
import { logger } from '../logger';

const SCHEDULES_PATH = path.join(process.cwd(), 'skills', 'schedules.json');

export interface Schedule {
    id: string;
    skillId: string;
    accountId?: string;
    intervalMs: number;
    lastRun?: string;
    chatId: number;
    enabled: boolean;
}

class AutomationScheduler {
    private schedules: Map<string, Schedule> = new Map();
    private intervals: Map<string, NodeJS.Timeout> = new Map();
    private started = false;

    async start() {
        if (this.started) return;
        this.started = true;

        await ensureSkillsLoaded();
        await this.load();

        for (const schedule of this.schedules.values()) {
            if (schedule.enabled) {
                this.setupTimer(schedule);
            }
        }
        logger.info(`[Scheduler] Started with ${this.schedules.size} schedule(s).`);
    }

    async addSchedule(skillId: string, intervalMinutes: number, chatId: number, accountId?: string): Promise<string> {
        const id = Math.random().toString(36).substring(7);
        const schedule: Schedule = {
            id,
            skillId,
            accountId,
            intervalMs: intervalMinutes * 60 * 1000,
            chatId,
            enabled: true,
        };

        this.schedules.set(id, schedule);
        this.setupTimer(schedule);
        await this.save();
        return id;
    }

    async stopSchedule(id: string): Promise<boolean> {
        const schedule = this.schedules.get(id);
        if (!schedule) return false;

        this.clearTimer(id);
        this.schedules.delete(id);
        await this.save();
        return true;
    }

    getSchedules(): Schedule[] {
        return Array.from(this.schedules.values());
    }

    private setupTimer(schedule: Schedule) {
        this.clearTimer(schedule.id);

        const timer = setInterval(async () => {
            await this.runSchedule(schedule);
        }, schedule.intervalMs);

        this.intervals.set(schedule.id, timer);
    }

    private clearTimer(id: string) {
        const timer = this.intervals.get(id);
        if (timer) {
            clearInterval(timer);
            this.intervals.delete(id);
        }
    }

    private async runSchedule(schedule: Schedule) {
        try {
            const skill = skillRegistry.get(schedule.skillId);
            if (!skill) {
                logger.warn(`[Scheduler] Skill ${schedule.skillId} not found for schedule ${schedule.id}. Disabling.`);
                await this.stopSchedule(schedule.id);
                return;
            }

            logger.info(`[Scheduler] Triggering scheduled job for skill: ${schedule.skillId} (Schedule: ${schedule.id})`);
            await createJob(skill as any, schedule.accountId, schedule.chatId);

            schedule.lastRun = new Date().toISOString();
            await this.save();
        } catch (err: any) {
            logger.error(`[Scheduler] Error running schedule ${schedule.id}: ${err.message}`);
        }
    }

    private async save() {
        try {
            await fs.mkdir(path.dirname(SCHEDULES_PATH), { recursive: true });
            await fs.writeFile(SCHEDULES_PATH, JSON.stringify(Array.from(this.schedules.values()), null, 2));
        } catch (err: any) {
            logger.error(`[Scheduler] Failed to save schedules: ${err.message}`);
        }
    }

    private async load() {
        try {
            if (await fs.stat(SCHEDULES_PATH).catch(() => null)) {
                const data = await fs.readFile(SCHEDULES_PATH, 'utf-8');
                const list: Schedule[] = JSON.parse(data);
                for (const s of list) {
                    this.schedules.set(s.id, s);
                }
            }
        } catch (err: any) {
            logger.error(`[Scheduler] Failed to load schedules: ${err.message}`);
        }
    }
}

export const scheduler = new AutomationScheduler();

import { Page, BrowserContext } from 'playwright';
import { pool } from '../lib/automation/pool';
import { Skill, skillRegistry } from '../lib/automation/skills';
import { ForgeEngine } from '../lib/automation/forge';

export abstract class BaseTask {
    protected page: Page | null = null;
    protected context: BrowserContext | null = null;
    private release: (() => Promise<void>) | null = null;

    async setup() {
        const slot = await pool.acquire();
        this.page = slot.page;
        this.context = slot.context;
        this.release = slot.release;
    }

    abstract execute(): Promise<void>;

    async cleanup() {
        if (this.release) {
            await this.release();
            this.release = null;
            this.page = null;
            this.context = null;
        }
    }

    protected async humanDelay(min: number = 1000, max: number = 3000) {
        const delay = Math.floor(Math.random() * (max - min + 1) + min);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    protected async humanType(selector: string, text: string) {
        if (!this.page) return;
        for (const char of text) {
            await this.page.type(selector, char, { delay: Math.random() * 300 + 50 });
        }
    }

    protected async useSkill(skillId: string, ...args: any[]) {
        if (!this.page || !this.context) throw new Error('Task not setup');
        const skill = skillRegistry.get(skillId);
        if (!skill) throw new Error(`Skill ${skillId} not found`);

        return await skill.execute({ page: this.page, context: this.context }, ...args);
    }

    protected async forgeSkill(intent: string, context?: string) {
        const skill = await ForgeEngine.blacksmith(intent, context);
        if (!skill) throw new Error(`Forge failed to create skill for: ${intent}`);
        return skill.id;
    }
}

import { Page, BrowserContext } from 'playwright';

export interface SkillContext {
    page: Page;
    context: BrowserContext;
}

export interface Skill {
    id: string;
    name: string;
    description: string;
    execute(ctx: SkillContext, botToken?: string, chatId?: number, ...args: any[]): Promise<any>;
}

export abstract class BaseSkill implements Skill {
    abstract id: string;
    abstract name: string;
    abstract description: string;
    abstract execute(ctx: SkillContext, botToken?: string, chatId?: number, ...args: any[]): Promise<any>;

    protected async delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

class SkillRegistry {
    private skills: Map<string, Skill> = new Map();

    register(skill: Skill) {
        this.skills.set(skill.id, skill);
    }

    get(id: string): Skill | undefined {
        return this.skills.get(id);
    }

    getAll(): Skill[] {
        return Array.from(this.skills.values());
    }
}

export const skillRegistry = new SkillRegistry();

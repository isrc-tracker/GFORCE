import { BaseTask } from './base-task';
import { skillRegistry } from '../lib/automation/skills';
import { SearchSocialsSkill } from '../lib/automation/skill-search-socials';

// Register the skill
skillRegistry.register(new SearchSocialsSkill());

class SkillTestTask extends BaseTask {
    async execute() {
        console.log('--- G-Force: Skill Verification ---');

        // Demonstrate using a registered skill
        const artist = 'Billie Eilish';
        console.log(`Executing skill 'search-socials' for artist: ${artist}`);

        const results = await this.useSkill('search-socials', artist);

        console.log('Skill Results:', results);

        if (results && results.length > 0) {
            console.log('✅ Skill execution successful!');
        } else {
            console.log('❌ Skill execution failed or returned no results.');
        }
    }
}

async function run() {
    const task = new SkillTestTask();
    try {
        await task.setup();
        await task.execute();
    } catch (error) {
        console.error('Skill verification failed:', error);
    } finally {
        await task.cleanup();
        process.exit(0);
    }
}

run();

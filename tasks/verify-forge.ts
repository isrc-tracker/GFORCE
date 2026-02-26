import { BaseTask } from './base-task';
import { SelfHealer } from '../lib/automation/self-heal';

class ForgeVerificationTask extends BaseTask {
    async execute() {
        console.log('--- G-Force: Forge Protocol Verification ---');
        console.log('Objective: Demonstrate autonomous tool generation (Self-Healing)');

        // Simulate a roadblock where the bot needs to extract specific data but doesn't have the tool
        const roadblock = 'Extracting metadata from the browser that requires a complex custom script';

        await this.page?.goto('https://example.com');

        const result = await SelfHealer.attempt(this, roadblock, async () => {
            // This intentionally fails to trigger the Forge
            throw new Error('No tool found for complex metadata extraction');
        });

        console.log('Final Result via Forged Tool:', result);

        if (result) {
            console.log('✅ Forge Verification Successful: Bot created and used its own tool.');
        } else {
            console.log('❌ Forge Verification Failed.');
        }
    }
}

async function run() {
    const task = new ForgeVerificationTask();
    try {
        await task.setup();
        await task.execute();
    } catch (err) {
        console.error('Forge Verification Task failed:', err);
    } finally {
        await task.cleanup();
        process.exit(0);
    }
}

run();

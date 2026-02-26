/**
 * SelfHealer Utility
 * Enables bots to autonomously recover from execution roadblocks
 * by triggering the Forge Protocol.
 */
export class SelfHealer {
    /**
     * Attempts an action. If it fails, it uses the task's forge capability
     * to create a specialized recovery tool.
     */
    static async attempt(task: any, roadblock: string, action: () => Promise<any>): Promise<any> {
        try {
            return await action();
        } catch (err) {
            console.warn(`[Self-Healer] ⚠️ Roadblock: ${roadblock}`);
            console.log(`[Self-Healer] ⚡ Initiating Forge Protocol for autonomous recovery...`);

            try {
                // Request a new skill specifically for this roadblock
                const skillId = await task.forgeSkill(
                    `Overcome roadblock: ${roadblock}. Error context: ${(err as Error).message}`,
                    `The bot was attempting to: ${roadblock}. It failed. Page URL: ${await task.page?.url()}`
                );

                console.log(`[Self-Healer] 🛠️ Recovery tool '${skillId}' forged successfully.`);
                console.log(`[Self-Healer] 🔄 Retrying mission using newly forged tool...`);

                return await task.useSkill(skillId);
            } catch (forgeErr) {
                console.error(`[Self-Healer] ❌ Critical: Forge Protocol failed to provide recovery.`, forgeErr);
                throw err; // Re-throw original error if forge fails
            }
        }
    }
}

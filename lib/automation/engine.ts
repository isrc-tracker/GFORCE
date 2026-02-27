import { Browser, BrowserContext, Page } from 'playwright';
import { playwright, applyAdvancedStealth } from './stealth';
import { getRandomProfile, getHumanHeaders } from './fingerprinting';

export class AutomationEngine {
    private browser: Browser | null = null;

    async init() {
        const endpoint = process.env.BRIGHT_DATA_BROWSER_URL;
        if (endpoint) {
            console.log(`[Engine] Connecting to Bright Data Scraping Browser...`);
            this.browser = await (playwright as any).connectOverCDP(endpoint);
        } else {
            this.browser = await (playwright as any).launch({
                headless: true, // Set to false if you want to see it in action
            });
        }
    }

    async createSession(): Promise<{ context: BrowserContext; page: Page }> {
        if (!this.browser) {
            await this.init();
        }

        const profile = getRandomProfile();
        const context = await this.browser!.newContext({
            userAgent: profile.userAgent,
            viewport: profile.viewport,
            deviceScaleFactor: profile.deviceScaleFactor,
            extraHTTPHeaders: getHumanHeaders(profile),
        });

        const page = await context.newPage();

        // Apply Advanced Red-Team Stealth Overrides
        await applyAdvancedStealth(page);

        // Add human-like behavior hooks here if needed
        // e.g. mouse movement randomization, scroll patterns

        return { context, page };
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

export const engine = new AutomationEngine();

import { Browser, BrowserContext, Page } from 'playwright';
import { playwright, applyAdvancedStealth } from './stealth';
import { getRandomProfile, getHumanHeaders } from './fingerprinting';
import { proxyManager } from './proxy';

interface Slot {
    browser: Browser;
    context: BrowserContext;
    page: Page;
    inUse: boolean;
}

interface Waiter {
    resolve: (slot: Slot) => void;
    reject: (err: Error) => void;
}

export interface AcquiredSlot {
    context: BrowserContext;
    page: Page;
    release: () => Promise<void>;
}

export class ContextPool {
    private slots: Slot[] = [];
    private browsers: Browser[] = [];
    private queue: Waiter[] = [];
    private readonly cap: number;
    private readonly contextsPerBrowser: number;
    /** Count of spawnSlot() calls currently in-flight — included in cap check. */
    private spawning = 0;

    constructor(cap = 100, contextsPerBrowser = 15) {
        this.cap = cap;
        this.contextsPerBrowser = contextsPerBrowser;
    }

    private async spawnSlot(account?: any): Promise<Slot> {
        let browser = this.browsers.find(b => {
            const owned = this.slots.filter(s => s.browser === b).length;
            return owned < this.contextsPerBrowser;
        });

        const retryLimit = 3;
        let lastErr: Error | null = null;

        for (let attempt = 1; attempt <= retryLimit; attempt++) {
            let proxy = proxyManager.getProxy(account);
            let proxyUrl = proxy?.url;

            try {
                if (!browser) {
                    let endpoint = process.env.BRIGHT_DATA_BROWSER_URL;
                    if (endpoint) {
                        const country = account?.metadata?.country || process.env.BRIGHT_DATA_DEFAULT_COUNTRY;
                        if (country) {
                            endpoint = endpoint.replace('-zone-scraping_browser1', `-zone-scraping_browser1-country-${country}`);
                        }
                        console.log(`[Pool] Connecting to Bright Data (Attempt ${attempt}/${retryLimit})${country ? ` [${country}]` : ''}...`);
                        browser = await (playwright as any).connectOverCDP(endpoint);
                    } else {
                        browser = await (playwright as any).launch({ headless: true });
                    }
                    this.browsers.push(browser);
                }

                const profile = getRandomProfile();
                const contextOptions: any = {
                    userAgent: profile.userAgent,
                    viewport: profile.viewport,
                    deviceScaleFactor: profile.deviceScaleFactor,
                    extraHTTPHeaders: getHumanHeaders(profile),
                };

                if (proxyUrl) {
                    console.log(`[Pool] Using ${proxy?.type} proxy: ${proxy?.provider}`);
                    const url = new URL(proxyUrl);
                    contextOptions.proxy = {
                        server: `http://${url.host}`,
                        username: url.username,
                        password: url.password,
                    };
                }

                const context = await browser!.newContext(contextOptions);
                const page = await context.newPage();
                await applyAdvancedStealth(page);

                // Success! Mark proxy as healthy if we used one
                if (proxyUrl) proxyManager.markSuccess(proxyUrl);

                if (account?.cookies) {
                    await context.addCookies(account.cookies);
                }

                const slot: Slot = { browser: browser!, context, page, inUse: false };
                this.slots.push(slot);
                return slot;
            } catch (err) {
                lastErr = err instanceof Error ? err : new Error(String(err));
                console.error(`[Pool] Spawn attempt ${attempt} failed:`, lastErr.message);

                // If it was a proxy issue, mark it as a failure
                if (proxyUrl && (lastErr.message.includes('proxy') || lastErr.message.includes('ECONN') || lastErr.message.includes('ETIMEDOUT'))) {
                    proxyManager.markFailure(proxyUrl);
                }

                // If browser died, remove it from list
                if (browser && !browser.isConnected()) {
                    this.browsers = this.browsers.filter(b => b !== browser);
                    browser = undefined;
                }

                if (attempt < retryLimit) {
                    await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
                }
            }
        }

        throw lastErr || new Error('Failed to spawn browser slot after multiple attempts');
    }

    /**
     * Serve the next queued waiter with a fresh slot.
     */
    private async drainQueue(): Promise<void> {
        if (this.queue.length === 0) return;
        const waiter = this.queue.shift()!;
        this.spawning++;
        try {
            const slot = await this.spawnSlot();
            slot.inUse = true;
            waiter.resolve(slot);
        } catch (err) {
            waiter.reject(err instanceof Error ? err : new Error(String(err)));
        } finally {
            this.spawning--;
        }
    }

    /**
     * Acquire a browser slot. Blocks when the pool is at capacity.
     * @param options Account usage or timeout
     */
    async acquire(options?: string | number | { accountId?: string; timeoutMs?: number }): Promise<AcquiredSlot> {
        const accountId = typeof options === 'string' ? options : (typeof options === 'object' ? options?.accountId : undefined);
        const timeoutMs = typeof options === 'number'
            ? options
            : (typeof options === 'object' ? options?.timeoutMs : undefined) ?? 30_000;

        let account = null;
        if (accountId) {
            const { getAccount } = await import('./accounts');
            account = await getAccount(accountId);
        }

        let slot: Slot;

        // For account-specific requests, we ALWAYS spawn a fresh slot to avoid dirty sessions
        // unless we implementing a complex slot-per-account affinity (not needed yet).
        if (account || this.queue.length > 0 || this.slots.length + this.spawning >= this.cap) {
            if (this.slots.length + this.spawning < this.cap) {
                this.spawning++;
                try {
                    slot = await this.spawnSlot(account);
                } finally {
                    this.spawning--;
                }
                slot.inUse = true;
            } else {
                // Wait in line
                slot = await new Promise<Slot>((resolve, reject) => {
                    let timedOut = false;
                    const timer = setTimeout(() => {
                        timedOut = true;
                        this.queue = this.queue.filter(w => w.resolve !== wrappedResolve);
                        reject(new Error(`acquire() timed out after ${timeoutMs}ms`));
                    }, timeoutMs);

                    const wrappedResolve = (s: Slot) => {
                        clearTimeout(timer);
                        if (timedOut) {
                            s.inUse = false;
                        } else {
                            resolve(s);
                        }
                    };
                    this.queue.push({ resolve: wrappedResolve, reject });
                });
            }
        } else {
            // Fast path: reuse idle slot
            const free = this.slots.find(s => !s.inUse);
            if (free) {
                slot = free;
                slot.inUse = true;
            } else {
                this.spawning++;
                try {
                    slot = await this.spawnSlot();
                } finally {
                    this.spawning--;
                }
                slot.inUse = true;
            }
        }

        const release = async () => {
            // If the session was tied to an account, we should extract cookies before closing
            if (accountId) {
                const cookies = await slot.context.cookies();
                const { getAccount, saveAccount } = await import('./accounts');
                const account = await getAccount(accountId);
                if (account) {
                    account.cookies = cookies;
                    account.lastUsed = new Date().toISOString();
                    await saveAccount(account);
                }
            }

            this.slots = this.slots.filter(s => s !== slot);
            await slot.context.close().catch(() => { });
            await this.drainQueue();
        };

        return { context: slot.context, page: slot.page, release };
    }

    get stats() {
        const counts = this.slots.reduce(
            (acc, s) => { s.inUse ? acc.inUse++ : acc.idle++; return acc; },
            { inUse: 0, idle: 0 }
        );
        return {
            slots: this.slots.length,
            ...counts,
            spawning: this.spawning,
            queued: this.queue.length,
            browsers: this.browsers.length,
        };
    }

    async shutdown() {
        // Reject all pending waiters before tearing down.
        for (const waiter of this.queue) {
            waiter.reject(new Error('ContextPool is shutting down'));
        }
        this.queue = [];
        await Promise.all(this.browsers.map(b => b.close().catch(() => { })));
        this.browsers = [];
        this.slots = [];
    }
}

export const pool = new ContextPool(100);

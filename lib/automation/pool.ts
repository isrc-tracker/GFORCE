import { Browser, BrowserContext, Page } from 'playwright';
import { playwright, applyAdvancedStealth } from './stealth';
import { getRandomProfile, getHumanHeaders } from './fingerprinting';

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

    private async spawnSlot(): Promise<Slot> {
        let browser = this.browsers.find(b => {
            const owned = this.slots.filter(s => s.browser === b).length;
            return owned < this.contextsPerBrowser;
        });

        if (!browser) {
            browser = await playwright.launch({ headless: true });
            this.browsers.push(browser);
        }

        const profile = getRandomProfile();
        const context = await browser.newContext({
            userAgent: profile.userAgent,
            viewport: profile.viewport,
            deviceScaleFactor: profile.deviceScaleFactor,
            extraHTTPHeaders: getHumanHeaders(profile),
        });

        let page: Page;
        try {
            page = await context.newPage();
            await applyAdvancedStealth(page);
        } catch (err) {
            // Prevent context leak if stealth setup fails
            await context.close().catch(() => {});
            throw err;
        }

        const slot: Slot = { browser, context, page, inUse: false };
        this.slots.push(slot);
        return slot;
    }

    /**
     * Serve the next queued waiter with a fresh slot.
     * spawning is incremented to block concurrent acquires from bypassing the queue.
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
     * Always call release() when done — wrap in try/finally.
     *
     * @param timeoutMs Max wait time when pool is full. Default 30 s.
     */
    async acquire(timeoutMs = 30_000): Promise<AcquiredSlot> {
        let slot: Slot;

        // Respect queue order: skip the fast path if others are already waiting.
        const free = this.queue.length === 0
            ? this.slots.find(s => !s.inUse)
            : undefined;

        if (free) {
            slot = free;
            slot.inUse = true;
        } else if (this.queue.length === 0 && this.slots.length + this.spawning < this.cap) {
            // Increment before the first await so concurrent acquires see the reservation.
            this.spawning++;
            try {
                slot = await this.spawnSlot();
            } finally {
                this.spawning--;
            }
            slot.inUse = true;
        } else {
            // Pool is full or queue is non-empty — wait in line.
            slot = await new Promise<Slot>((resolve, reject) => {
                let timedOut = false;

                const timer = setTimeout(() => {
                    timedOut = true;
                    this.queue = this.queue.filter(w => w.resolve !== wrappedResolve);
                    reject(new Error(
                        `acquire() timed out after ${timeoutMs}ms — pool at capacity (${this.cap})`
                    ));
                }, timeoutMs);

                const wrappedResolve = (s: Slot) => {
                    clearTimeout(timer);
                    if (timedOut) {
                        // Slot arrived after caller gave up — return it to idle so
                        // the next acquire() or drainQueue() can pick it up.
                        s.inUse = false;
                    } else {
                        resolve(s);
                    }
                };

                this.queue.push({ resolve: wrappedResolve, reject });
            });
        }

        const release = async () => {
            // Remove and close the slot — next acquire gets a fresh identity.
            this.slots = this.slots.filter(s => s !== slot);
            await slot.context.close().catch(() => {});

            // Prune all idle browsers in parallel; always keep at least one warm.
            const idle = this.browsers.filter(
                b => this.slots.filter(s => s.browser === b).length === 0
            );
            const toPrune = idle.slice(0, Math.max(0, idle.length - 1));
            this.browsers = this.browsers.filter(b => !toPrune.includes(b));
            await Promise.all(toPrune.map(b => b.close().catch(() => {})));

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
        await Promise.all(this.browsers.map(b => b.close().catch(() => {})));
        this.browsers = [];
        this.slots = [];
    }
}

export const pool = new ContextPool(100);

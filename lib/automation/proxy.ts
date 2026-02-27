import { logger } from '../logger';

export interface ProxyConfig {
    url: string;
    type: 'mobile' | 'residential' | 'datacenter';
    provider: string;
    failures: number;
    lastUsed: string;
    isDead: boolean;
}

class ProxyManager {
    private proxies: ProxyConfig[] = [];
    private currentIndex = 0;
    private readonly FAILURE_THRESHOLD = 3;

    constructor() {
        this.initialize();
    }

    private initialize() {
        // Load initial proxies from environment
        const mobile1 = process.env.BRIGHT_DATA_MOBILE_PROXY_URL;
        const mobile2 = process.env.BRIGHT_DATA_MOBILE_PROXY_URL_2;
        const residential = process.env.RESIDENTIAL_PROXY_URL;

        const base = { failures: 0, lastUsed: new Date().toISOString(), isDead: false };

        if (mobile1) {
            this.proxies.push({ ...base, url: mobile1, type: 'mobile', provider: 'bright-data' });
        }
        if (mobile2) {
            this.proxies.push({ ...base, url: mobile2, type: 'mobile', provider: 'bright-data' });
        }
        if (residential) {
            this.proxies.push({ ...base, url: residential, type: 'residential', provider: 'iproyal' });
        }

        logger.info(`[ProxyManager] Initialized with ${this.proxies.length} proxies (Mobile: ${mobile2 ? 2 : 1}).`);
    }

    /**
     * Gets the next proxy in rotation.
     * If an account has a specific type preference, it tries to satisfy it.
     */
    getProxy(account?: any): ProxyConfig | undefined {
        const activeProxies = this.proxies.filter(p => !p.isDead);
        if (activeProxies.length === 0) return undefined;

        const preference = account?.metadata?.proxyType;

        if (preference) {
            const matches = activeProxies.filter(p => p.type === preference);
            if (matches.length > 0) {
                const index = Math.floor(Math.random() * matches.length);
                const p = matches[index];
                p.lastUsed = new Date().toISOString();
                return p;
            }
        }

        // Default: Round Robin across active proxies
        let proxy = activeProxies.find((_, i) => i === (this.currentIndex % activeProxies.length));
        if (!proxy) proxy = activeProxies[0];

        this.currentIndex = (this.currentIndex + 1) % activeProxies.length;
        proxy.lastUsed = new Date().toISOString();

        logger.info(`[ProxyManager] Rotating to proxy: ${proxy.type} (${proxy.provider})`);
        return proxy;
    }

    markFailure(url: string) {
        const proxy = this.proxies.find(p => p.url === url);
        if (proxy) {
            proxy.failures++;
            if (proxy.failures >= this.FAILURE_THRESHOLD) {
                proxy.isDead = true;
                logger.error(`[ProxyManager] 💀 Proxy ${proxy.type} (${proxy.provider}) marked as DEAD after ${proxy.failures} failures.`);
            }
        }
    }

    markSuccess(url: string) {
        const proxy = this.proxies.find(p => p.url === url);
        if (proxy) {
            proxy.failures = 0; // Reset failures on successful use
        }
    }

    addProxies(urls: string[], type: ProxyConfig['type'], provider: string) {
        for (const url of urls) {
            this.proxies.push({
                url, type, provider,
                failures: 0,
                lastUsed: new Date().toISOString(),
                isDead: false
            });
        }
    }

    getAll(): ProxyConfig[] {
        return this.proxies;
    }
}

export const proxyManager = new ProxyManager();

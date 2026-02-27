import { logger } from '../logger';

export interface ProxyConfig {
    url: string;
    type: 'mobile' | 'residential' | 'datacenter';
    provider: string;
}

class ProxyManager {
    private proxies: ProxyConfig[] = [];
    private currentIndex = 0;

    constructor() {
        this.initialize();
    }

    private initialize() {
        // Load initial proxies from environment
        const mobile1 = process.env.BRIGHT_DATA_MOBILE_PROXY_URL;
        const mobile2 = process.env.BRIGHT_DATA_MOBILE_PROXY_URL_2;
        const residential = process.env.RESIDENTIAL_PROXY_URL;

        if (mobile1) {
            this.proxies.push({ url: mobile1, type: 'mobile', provider: 'bright-data' });
        }
        if (mobile2) {
            this.proxies.push({ url: mobile2, type: 'mobile', provider: 'bright-data' });
        }
        if (residential) {
            this.proxies.push({ url: residential, type: 'residential', provider: 'iproyal' });
        }

        logger.info(`[ProxyManager] Initialized with ${this.proxies.length} proxies (Mobile: ${mobile2 ? 2 : 1}).`);
    }

    /**
     * Gets the next proxy in rotation.
     * If an account has a specific type preference, it tries to satisfy it.
     */
    getProxy(account?: any): ProxyConfig | undefined {
        if (this.proxies.length === 0) return undefined;

        const preference = account?.metadata?.proxyType; // 'mobile', 'residential', etc.

        if (preference) {
            const matches = this.proxies.filter(p => p.type === preference);
            if (matches.length > 0) {
                // Return a random match or round-robin within the type
                const index = Math.floor(Math.random() * matches.length);
                return matches[index];
            }
        }

        // Default: Round Robin across all proxies
        const proxy = this.proxies[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.proxies.length;

        logger.info(`[ProxyManager] Rotating to proxy: ${proxy.type} (${proxy.provider})`);
        return proxy;
    }

    /**
     * Allows adding more proxies dynamically (e.g. from a list)
     */
    addProxies(urls: string[], type: ProxyConfig['type'], provider: string) {
        for (const url of urls) {
            this.proxies.push({ url, type, provider });
        }
        logger.info(`[ProxyManager] Added ${urls.length} ${type} proxies from ${provider}.`);
    }

    getAll(): ProxyConfig[] {
        return this.proxies;
    }
}

export const proxyManager = new ProxyManager();

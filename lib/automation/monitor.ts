import { logger } from '../logger';

export interface DomainStats {
    domain: string;
    successCount: number;
    failureCount: number;
    lastFailedAt?: string;
    throttled: boolean;
}

const statsMap = new Map<string, DomainStats>();
const DEFAULT_THRESHOLD = 0.90; // 90% success rate required
const MIN_SESSIONS_TO_CHECK = 5;  // Don't throttle until we have some data

export class Monitor {
    /**
     * Records the outcome of a session for a given domain.
     */
    static recordResult(domain: string, success: boolean) {
        let stats = statsMap.get(domain);
        if (!stats) {
            stats = { domain, successCount: 0, failureCount: 0, throttled: false };
            statsMap.set(domain, stats);
        }

        if (success) {
            stats.successCount++;
        } else {
            stats.failureCount++;
            stats.lastFailedAt = new Date().toISOString();
        }

        this.checkThrottle(stats);
    }

    private static checkThrottle(stats: DomainStats) {
        const total = stats.successCount + stats.failureCount;
        if (total < MIN_SESSIONS_TO_CHECK) return;

        const rate = stats.successCount / total;
        if (rate < DEFAULT_THRESHOLD) {
            if (!stats.throttled) {
                logger.warn(`[Monitor] Domain ${stats.domain} throttled! Success rate: ${(rate * 100).toFixed(1)}%`);
                stats.throttled = true;
            }
        } else {
            if (stats.throttled && rate >= DEFAULT_THRESHOLD + 0.05) { // Hysteresis: wait until it recovers a bit more
                logger.info(`[Monitor] Domain ${stats.domain} recovered. Resuming...`);
                stats.throttled = false;
            }
        }
    }

    /**
     * Checks if a domain is currently throttled.
     */
    static isThrottled(domain: string): boolean {
        const stats = statsMap.get(domain);
        return stats?.throttled || false;
    }

    static getStats(domain: string): DomainStats | undefined {
        return statsMap.get(domain);
    }

    static getAllStats(): DomainStats[] {
        return Array.from(statsMap.values());
    }

    /**
     * Manually reset stats for a domain (e.g. after fixing an issue).
     */
    static reset(domain: string) {
        statsMap.delete(domain);
        logger.info(`[Monitor] Reset stats for ${domain}`);
    }
}

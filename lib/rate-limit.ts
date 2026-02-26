/**
 * In-memory sliding window rate limiter.
 * Defense-in-depth layer — nginx handles rate limiting in production,
 * this covers direct Node.js access and development.
 */
interface Window {
    count: number
    resetAt: number
}

const windows = new Map<string, Window>()

export function checkRateLimit(
    key: string,
    limit: number,
    windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    let w = windows.get(key)

    if (!w || now > w.resetAt) {
        w = { count: 0, resetAt: now + windowMs }
        windows.set(key, w)
    }

    const allowed = w.count < limit
    if (allowed) w.count++

    return {
        allowed,
        remaining: Math.max(0, limit - w.count),
        resetAt: w.resetAt,
    }
}

// Prune stale entries every 5 minutes to prevent memory growth
setInterval(() => {
    const now = Date.now()
    for (const [key, w] of windows) {
        if (now > w.resetAt) windows.delete(key)
    }
}, 5 * 60_000)

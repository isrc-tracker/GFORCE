export interface BrowserProfile {
    userAgent: string
    viewport: { width: number; height: number }
    deviceScaleFactor: number
    platform: string
}

// Chrome 131 only — consistent with Sec-Ch-Ua headers.
// Firefox removed: its UA would conflict with Chrome-specific Sec-Ch-Ua headers.
const PROFILES: Array<{ ua: string; platform: string }> = [
    {
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        platform: 'Windows',
    },
    {
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        platform: 'macOS',
    },
    {
        ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        platform: 'Linux',
    },
]

const VIEWPORTS = [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
]

export function getRandomProfile(): BrowserProfile {
    const entry = PROFILES[Math.floor(Math.random() * PROFILES.length)]
    const viewport = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)]
    return {
        userAgent: entry.ua,
        platform: entry.platform,
        viewport,
        deviceScaleFactor: 1,
    }
}

export function getHumanHeaders(profile: BrowserProfile) {
    return {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        // Version matches UA above — consistent fingerprint
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': `"${profile.platform}"`,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
    }
}

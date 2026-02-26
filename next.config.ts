import type { NextConfig } from 'next'

const config: NextConfig = {
    output: 'standalone',
    serverExternalPackages: [
        'playwright',
        'playwright-extra',
        'playwright-core',
        'puppeteer-extra',
        'puppeteer-extra-plugin-stealth',
        'puppeteer-extra-plugin-adblocker',
    ],
}

export default config

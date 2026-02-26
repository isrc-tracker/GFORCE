import { logger } from './logger'

let shuttingDown = false

export function registerShutdownHandlers() {
    async function gracefulShutdown(signal: string) {
        if (shuttingDown) return
        shuttingDown = true

        logger.info(`Graceful shutdown triggered`, { signal })

        try {
            // Lazy import to avoid circular deps at startup
            const { pool } = await import('./automation/pool')
            logger.info('Closing browser pool...')
            await Promise.race([
                pool.shutdown(),
                new Promise(r => setTimeout(r, 15_000)), // 15s hard limit
            ])
            logger.info('Browser pool closed.')
        } catch (err) {
            logger.error('Error during shutdown', { error: (err as Error).message })
        }

        process.exit(0)
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'))

    process.on('uncaughtException', async (err) => {
        logger.error('Uncaught exception', { error: err.message, stack: err.stack })
        await gracefulShutdown('uncaughtException')
    })

    process.on('unhandledRejection', async (reason) => {
        logger.error('Unhandled rejection', { reason: String(reason) })
        // Don't exit on unhandled rejections — just log them
    })
}

type Level = 'info' | 'warn' | 'error' | 'debug'

function emit(level: Level, msg: string, data?: Record<string, unknown>) {
    const entry = { ts: new Date().toISOString(), level, msg, ...data }

    if (process.env.NODE_ENV === 'production') {
        // Structured JSON — parseable by Datadog, Loki, CloudWatch, etc.
        process.stdout.write(JSON.stringify(entry) + '\n')
    } else {
        const icon = { info: '·', warn: '⚠', error: '✗', debug: '○' }[level]
        console.log(`${icon} [${level.toUpperCase()}] ${msg}`, data ? data : '')
    }
}

export const logger = {
    info:  (msg: string, data?: Record<string, unknown>) => emit('info',  msg, data),
    warn:  (msg: string, data?: Record<string, unknown>) => emit('warn',  msg, data),
    error: (msg: string, data?: Record<string, unknown>) => emit('error', msg, data),
    debug: (msg: string, data?: Record<string, unknown>) => emit('debug', msg, data),
}

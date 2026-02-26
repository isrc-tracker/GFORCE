import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

let _anthropic: Anthropic | null = null
function getAnthropic() {
    if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    return _anthropic
}

let _openai: OpenAI | null = null
function getOpenAI() {
    if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return _openai
}

export const anthropic: Anthropic = new Proxy({} as Anthropic, {
    get(_t, prop, recv) {
        const c = getAnthropic()
        const v = Reflect.get(c, prop, recv)
        return typeof v === 'function' ? v.bind(c) : v
    },
})

export const openai: OpenAI = new Proxy({} as OpenAI, {
    get(_t, prop, recv) {
        const c = getOpenAI()
        const v = Reflect.get(c, prop, recv)
        return typeof v === 'function' ? v.bind(c) : v
    },
})

/**
 * Returns true if we should try the next provider instead of throwing.
 * Covers: auth failures, not-found, rate limits, server errors, and network issues.
 */
function shouldFallback(err: any): boolean {
    if (err?.status) return [401, 403, 404, 429, 500, 502, 503, 529].includes(err.status)
    // Network-level errors: ECONNREFUSED, ETIMEDOUT, ENOTFOUND, etc.
    if (err?.code) return true
    return false
}

export async function executeWithClaude(
    prompt: string,
    systemPrompt: string,
    maxTokens: number = 4096
): Promise<string> {
    // 1. Primary: Claude 3.5 Sonnet
    try {
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content: prompt }],
        })
        const content = message.content[0]
        return content.type === 'text' ? content.text : ''
    } catch (err: any) {
        if (!shouldFallback(err)) throw err
        console.warn(`[AI-Client] Claude 3.5 Sonnet unavailable (${err.status ?? err.code}). Falling back to GPT-4o...`)
    }

    // 2. Fallback: GPT-4o
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: maxTokens,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ],
        })
        return response.choices[0].message.content || ''
    } catch (err: any) {
        if (!shouldFallback(err)) throw err
        console.warn(`[AI-Client] GPT-4o unavailable (${err.status ?? err.code}). Final fallback to Claude Haiku...`)
    }

    // 3. Last resort: Claude Haiku
    const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
    })
    const content = message.content[0]
    return content.type === 'text' ? content.text : ''
}

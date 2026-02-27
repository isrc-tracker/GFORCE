const BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

export async function sendMessage(chatId: number, text: string): Promise<void> {
    try {
        const resp = await fetch(`${BASE()}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'Markdown',
            }),
        })
        if (!resp.ok) {
            const err = await resp.text()
            console.error('[Telegram] sendMessage failed:', resp.status, err)
        }
    } catch (err) {
        console.error('[Telegram] sendMessage error:', err)
    }
}

export async function sendDocument(
    chatId: number,
    filename: string,
    content: string,
    caption?: string
): Promise<void> {
    try {
        const formData = new FormData()
        formData.append('chat_id', String(chatId))
        formData.append('document', new Blob([content], { type: 'text/plain' }), filename)
        if (caption) formData.append('caption', caption)

        const resp = await fetch(`${BASE()}/sendDocument`, {
            method: 'POST',
            body: formData,
        })
        if (!resp.ok) {
            const err = await resp.text()
            console.error('[Telegram] sendDocument failed:', resp.status, err)
        }
    } catch (err) {
        console.error('[Telegram] sendDocument error:', err)
    }
}

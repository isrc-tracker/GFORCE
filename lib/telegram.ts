const BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

export async function sendMessage(chatId: number, text: string): Promise<void> {
    await fetch(`${BASE()}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
        }),
    })
}

export async function sendDocument(
    chatId: number,
    filename: string,
    content: string,
    caption?: string
): Promise<void> {
    const formData = new FormData()
    formData.append('chat_id', String(chatId))
    formData.append('document', new Blob([content], { type: 'text/plain' }), filename)
    if (caption) formData.append('caption', caption)

    await fetch(`${BASE()}/sendDocument`, {
        method: 'POST',
        body: formData,
    })
}

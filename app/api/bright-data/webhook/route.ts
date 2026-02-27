import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { sendMessage } from '@/lib/telegram';
import { getJob } from '@/lib/automation/jobs';

export async function POST(req: Request) {
    try {
        // Bright Data async results can come as JSON or as a raw response depending on settings.
        // Usually, the x-response-id is used to match back to the trigger.
        const responseId = req.headers.get('x-response-id');
        const data = await req.json();

        logger.info(`[BrightData-Webhook] Result ready for ID: ${responseId}`);

        // 1. Locate the job in the manager using the responseId
        // (We will update JobManager to use responseId as the key for these types of jobs)
        const job = responseId ? getJob(responseId) : null;

        if (job && job.chatId) {
            job.status = 'completed';
            job.result = data;

            await sendMessage(
                job.chatId,
                `✅ *Scraping Result Ready* (\`${responseId}\`)\nURL: \`${job.skillId}\`\n\n\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 1000)}\n\`\`\``
            );
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        logger.error(`[BrightData-Webhook] Error processing result`, { error: err.message });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

import { logger } from '../logger';

export interface UnlockerRequest {
    url: string;
    country?: string;
}

export async function submitAsyncScraping(options: UnlockerRequest): Promise<string> {
    const customer = process.env.BRIGHT_DATA_CUSTOMER_ID;
    const apiKey = process.env.BRIGHT_DATA_API_KEY;

    if (!customer || !apiKey) {
        throw new Error('Bright Data Customer ID or API Key missing in .env');
    }

    const payload = {
        url: options.url,
        flags: options.country ? `country-${options.country}` : undefined,
    };

    logger.info(`[WebUnlocker] Submitting async request for ${options.url}`);

    const response = await fetch(
        `https://api.brightdata.com/unblocker/req?customer=${customer}&zone=web_unlocker1`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Bright Data API Error: ${error}`);
    }

    // Capture the x-response-id from the headers
    const responseId = response.headers.get('x-response-id');
    if (!responseId) {
        throw new Error('Failed to retrieve x-response-id from Bright Data response');
    }

    return responseId;
}

export async function getScrapingResult(responseId: string): Promise<any> {
    const customer = process.env.BRIGHT_DATA_CUSTOMER_ID;
    const apiKey = process.env.BRIGHT_DATA_API_KEY;

    if (!customer || !apiKey) {
        throw new Error('Bright Data Customer ID or API Key missing in .env');
    }

    logger.info(`[WebUnlocker] Fetching result for ID: ${responseId}`);

    const response = await fetch(
        `https://api.brightdata.com/unblocker/get_result?customer=${customer}&zone=web_unlocker1&response_id=${responseId}`,
        {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        }
    );

    if (response.status === 202) {
        // Result not ready yet
        return null;
    }

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Bright Data API Error: ${error}`);
    }

    return await response.json();
}

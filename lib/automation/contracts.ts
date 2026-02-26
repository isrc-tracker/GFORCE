import { z } from 'zod';

const SAFE_ID = /^[\w\-]{1,128}$/;
const RETRY_DEFAULTS = { maxAttempts: 3, delayMs: 5_000 } as const;

const httpsUrl = z
    .url()
    .refine(
        (url) => ['http:', 'https:'].includes(new URL(url).protocol),
        { message: 'Only http and https protocols are allowed' }
    );

export const BotActionSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('navigate'),
        url: httpsUrl,
        timeout: z.number().int().min(0).max(60_000).optional(),
    }),
    z.object({
        type: z.literal('type'),
        selector: z.string().min(1).max(512),
        value: z.string().min(1).max(10_000),
        delay: z.number().int().min(0).max(1_000).optional(),
        timeout: z.number().int().min(0).max(60_000).optional(),
    }),
    z.object({
        type: z.literal('click'),
        selector: z.string().min(1).max(512),
        timeout: z.number().int().min(0).max(60_000).optional(),
    }),
    z.object({
        type: z.literal('wait'),
        ms: z.number().int().min(0).max(60_000),
    }),
    z.object({
        type: z.literal('screenshot'),
        name: z.string().regex(/^[\w\-]{1,128}$/, {
            message: 'Screenshot name must only contain alphanumerics, underscores, and hyphens (max 128 chars)',
        }),
    }),
    z.object({
        type: z.literal('press'),
        key: z.string().min(1).max(64),
        timeout: z.number().int().min(0).max(60_000).optional(),
    }),
]);

export const TaskContractSchema = z.object({
    id: z.uuid(),
    version: z.literal(1).default(1),
    name: z.string().min(1).max(256),
    description: z.string().max(2_048).optional(),
    targetUrl: httpsUrl,
    allowedDomains: z.array(z.string().min(1).max(253)).default([]),
    stealthLevel: z.enum(['standard', 'maximum']).default('standard'),
    payoutAmount: z.number().min(0).optional(),
    actions: z.array(BotActionSchema).min(1),
    requiredSkills: z
        .array(z.string().regex(SAFE_ID, { message: 'Skill ID must match /^[\\w\\-]{1,128}$/' }))
        .default([]),
    retryPolicy: z
        .object({
            maxAttempts: z.number().int().min(1).max(10).default(RETRY_DEFAULTS.maxAttempts),
            delayMs: z.number().int().min(0).max(300_000).default(RETRY_DEFAULTS.delayMs),
        })
        .default(RETRY_DEFAULTS),
    expiresAt: z.iso.datetime().optional(),
});

export type BotAction = z.infer<typeof BotActionSchema>;
export type TaskContract = z.infer<typeof TaskContractSchema>;

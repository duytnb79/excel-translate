import { z } from 'zod';

const envSchema = z.object({
  GOOGLE_CLOUD_PROJECT: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  AI_ACCESS_KEY: z.string().min(12),
  AI_DEFAULT_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  AI_ALLOWED_MODELS: z.string().min(1).default('gemini-3.6-flash,gemini-3.5-flash-lite'),
  DAILY_REQUEST_LIMIT: z.coerce.number().int().positive().default(100),
  DAILY_TOKEN_LIMIT: z.coerce.number().int().positive().default(1_000_000),
  PORT: z.coerce.number().int().positive().default(8080),
});

const parsedEnv = envSchema.parse(process.env);
const allowedModels = [...new Set(
  parsedEnv.AI_ALLOWED_MODELS
    .split(',')
    .map(model => model.trim())
    .filter(Boolean),
)];

if (!allowedModels.includes(parsedEnv.AI_DEFAULT_MODEL)) {
  throw new Error('AI_DEFAULT_MODEL must be included in AI_ALLOWED_MODELS');
}

export const env = {
  ...parsedEnv,
  AI_ALLOWED_MODELS: allowedModels,
};

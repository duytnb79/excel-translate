import type { AiProvider } from './aiProvider.js';
import { GeminiProvider } from './geminiProvider.js';

const geminiProvider = new GeminiProvider();

export function getAiProvider(model: string): AiProvider {
  if (model.startsWith('gemini-')) return geminiProvider;
  throw new Error('AI_PROVIDER_NOT_CONFIGURED');
}

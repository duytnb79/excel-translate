import { env } from '../config/env.js';

function getModelLabel(model: string) {
  return model
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function resolveAllowedModel(requestedModel?: string) {
  const model = requestedModel || env.AI_DEFAULT_MODEL;
  if (!env.AI_ALLOWED_MODELS.includes(model)) {
    throw new Error('MODEL_NOT_ALLOWED');
  }
  return model;
}

export function getModelCatalog() {
  return {
    defaultModel: env.AI_DEFAULT_MODEL,
    models: env.AI_ALLOWED_MODELS.map(id => ({
      id,
      label: getModelLabel(id),
      provider: 'gemini' as const,
    })),
  };
}

import { getFirebaseIdToken } from '../../../shared/services/firebase';
import { getAiAccessKey } from './aiAccess';
import type {
  ChatMessage,
  ChatUsage,
  SpreadsheetContextPayload,
} from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export interface AiModelOption {
  id: string;
  label: string;
  provider: 'gemini';
}

interface ModelCatalog {
  defaultModel: string;
  models: AiModelOption[];
}

interface CreateConversationInput extends SpreadsheetContextPayload {
  projectId: string;
  fileName: string;
}

async function authenticatedFetch(path: string, init?: RequestInit) {
  const accessKey = getAiAccessKey();
  if (!accessKey) throw new Error('Vui lòng kết nối secret key trong phần Cài đặt.');

  const token = await getFirebaseIdToken();
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-AI-Access-Key': accessKey,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
}

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || `Yêu cầu thất bại (${response.status})`;
}

export async function getModelCatalog(): Promise<ModelCatalog> {
  const response = await authenticatedFetch('/api/models');
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function createConversation(input: CreateConversationInput) {
  const response = await authenticatedFetch('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{ conversationId: string; contextVersion: number }>;
}

export async function replaceConversationContext(
  conversationId: string,
  context: SpreadsheetContextPayload,
) {
  const response = await authenticatedFetch(`/api/conversations/${conversationId}/context`, {
    method: 'PUT',
    body: JSON.stringify(context),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function getConversationMessages(conversationId: string, limit = 10, beforeId?: string) {
  let url = `/api/conversations/${conversationId}/messages?limit=${limit}`;
  if (beforeId) {
    url += `&beforeId=${beforeId}`;
  }
  const response = await authenticatedFetch(url);
  if (!response.ok) throw new Error(await readError(response));
  const payload = await response.json() as { messages: ChatMessage[] };
  return payload.messages;
}

export async function getConversations(projectId?: string) {
  let url = '/api/conversations';
  if (projectId) {
    url += `?projectId=${projectId}`;
  }
  const response = await authenticatedFetch(url);
  if (!response.ok) throw new Error(await readError(response));
  return await response.json() as Array<{
    id: string;
    projectId: string;
    fileName: string;
    title?: string;
    updatedAt: string;
  }>;
}

export async function deleteConversation(conversationId: string) {
  const response = await authenticatedFetch(`/api/conversations/${conversationId}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(await readError(response));
}

interface StreamChatOptions {
  conversationId: string;
  message: string;
  model?: string;
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onUsage: (usage: ChatUsage) => void;
}

interface SseEvent {
  event: string;
  data: string;
}

function parseSseEvent(block: string): SseEvent | null {
  let event = 'message';
  const data: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }

  return data.length > 0 ? { event, data: data.join('\n') } : null;
}

export async function streamConversationMessage(options: StreamChatOptions) {
  const response = await authenticatedFetch(
    `/api/conversations/${options.conversationId}/messages`,
    {
      method: 'POST',
      signal: options.signal,
      body: JSON.stringify({ message: options.message, model: options.model }),
      headers: { Accept: 'text/event-stream' },
    },
  );

  if (!response.ok) throw new Error(await readError(response));
  if (!response.body) throw new Error('Trình duyệt không hỗ trợ phản hồi dạng stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleEvent = (block: string) => {
    const parsed = parseSseEvent(block);
    if (!parsed) return;

    const payload = JSON.parse(parsed.data) as Record<string, unknown>;
    if (parsed.event === 'delta' && typeof payload.text === 'string') {
      options.onDelta(payload.text);
    } else if (parsed.event === 'usage') {
      options.onUsage(payload as unknown as ChatUsage);
    } else if (parsed.event === 'error') {
      throw new Error(typeof payload.error === 'string' ? payload.error : 'AI không thể trả lời.');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');

    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      handleEvent(block);
      boundary = buffer.indexOf('\n\n');
    }

    if (done) break;
  }

  if (buffer.trim()) handleEvent(buffer);
}

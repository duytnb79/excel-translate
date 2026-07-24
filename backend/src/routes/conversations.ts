import { Router } from 'express';
import {
  createConversation,
  deleteConversation,
  getMessages,
  listConversations,
  replaceConversationContext,
} from '../repositories/conversationRepository.js';
import {
  contextSchema,
  createConversationSchema,
  idSchema,
  messageSchema,
} from '../schemas/conversation.js';
import { streamChat } from '../services/chatService.js';
import { getContextStatus, validateContextSize } from '../services/contextService.js';
import type { AuthenticatedRequest } from '../types/http.js';
import { openSse, sendSse } from '../utils/sse.js';

export const conversationsRouter = Router();

conversationsRouter.get('/', async (req, res) => {
  try {
    const { uid } = req as unknown as AuthenticatedRequest;
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const list = await listConversations(uid, projectId);
    res.json(list);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list conversations';
    res.status(400).json({ error: message });
  }
});

conversationsRouter.post('/', async (req, res) => {
  try {
    const { uid } = req as unknown as AuthenticatedRequest;
    const input = createConversationSchema.parse(req.body);
    const result = await createConversation(uid, input, validateContextSize(input.sheets));
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create conversation';
    res.status(getContextStatus(error)).json({ error: message });
  }
});

conversationsRouter.put('/:conversationId/context', async (req, res) => {
  try {
    const { uid } = req as unknown as AuthenticatedRequest;
    const conversationId = idSchema.parse(req.params.conversationId);
    const input = contextSchema.parse(req.body);
    const result = await replaceConversationContext(
      uid,
      conversationId,
      input,
      validateContextSize(input.sheets),
    );
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update context';
    res.status(getContextStatus(error)).json({ error: message });
  }
});

conversationsRouter.get('/:conversationId/messages', async (req, res) => {
  try {
    const { uid } = req as unknown as AuthenticatedRequest;
    const conversationId = idSchema.parse(req.params.conversationId);
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 100) : 10;
    const beforeId = req.query.beforeId ? String(req.query.beforeId) : undefined;

    const messages = await getMessages(uid, conversationId, limit, beforeId);
    if (!messages) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json({ conversationId, messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load messages';
    res.status(400).json({ error: message });
  }
});

conversationsRouter.post('/:conversationId/messages', async (req, res) => {
  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abortController.abort();
  });

  try {
    const { uid } = req as unknown as AuthenticatedRequest;
    const conversationId = idSchema.parse(req.params.conversationId);
    const { message, model } = messageSchema.parse(req.body);

    openSse(res);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
    try {
      const usage = await streamChat({
        uid,
        conversationId,
        message,
        model,
        signal: abortController.signal,
        onDelta: text => sendSse(res, 'delta', { text }),
      });
      sendSse(res, 'usage', usage);
      sendSse(res, 'done', {});
    } finally {
      clearInterval(heartbeat);
    }
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send message';
    if (res.headersSent) {
      sendSse(res, 'error', { error: message });
      if (!res.writableEnded) {
        res.end();
      }
      return;
    }
    const status = message === 'CONVERSATION_NOT_FOUND'
      ? 404
      : message === 'DAILY_QUOTA_EXCEEDED'
        ? 429
        : message === 'MODEL_NOT_ALLOWED'
          ? 403
          : 400;
    res.status(status).json({ error: message });
  }
});

conversationsRouter.delete('/:conversationId', async (req, res) => {
  try {
    const { uid } = req as unknown as AuthenticatedRequest;
    const { conversationId } = req.params;
    await deleteConversation(uid, conversationId);
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete conversation';
    res.status(400).json({ error: message });
  }
});

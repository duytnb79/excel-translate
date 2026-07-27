import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatUsage, DocumentScope, PreparedDocumentContext } from '../types';
import {
  createConversation,
  getConversationMessages,
  getModelCatalog,
  replaceConversationContext,
  streamConversationMessage,
  type AiModelOption,
} from '../services/chatApi';

interface UseAiChatOptions {
  document: object | null;
  projectId: string | null;
  fileName: string;
  conversationId: string | null;
  onConversationCreated: (conversationId: string) => void | Promise<void>;
}

export function useAiChat(options: UseAiChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const createdConversationRef = useRef<string | null>(null);
  const lastUploadedContextRef = useRef<{ scope: DocumentScope; document: object } | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    getModelCatalog()
      .then(catalog => {
        setModels(catalog.models);
        setSelectedModel(current => current || catalog.defaultModel);
      })
      .catch(loadError => {
        setError(loadError instanceof Error ? loadError.message : 'Không thể tải danh sách model.');
      });
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    setError(null);
    lastUploadedContextRef.current = null; // Clear context cache on conversation change
    setHasMoreMessages(true);

    if (!options.conversationId) {
      setMessages([]);
      return;
    }
    if (createdConversationRef.current === options.conversationId) {
      createdConversationRef.current = null;
      return;
    }

    let cancelled = false;
    setIsLoadingHistory(true);
    const limit = 10;
    getConversationMessages(options.conversationId, limit)
      .then(history => {
        if (!cancelled) {
          setMessages(history);
          if (history.length < limit) {
            setHasMoreMessages(false);
          }
        }
      })
      .catch(loadError => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Không thể tải cuộc trò chuyện.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [options.conversationId]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(async (content: string, preparedContext: PreparedDocumentContext) => {
    const message = content.trim();
    if (!message || isStreaming) return;
    if (!options.document || !options.projectId) {
      setError('Vui lòng tải một tài liệu trước khi hỏi AI.');
      return;
    }

    const context = preparedContext.context;
    setError(null);
    setIsStreaming(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
    };
    const assistantId = crypto.randomUUID();
    setMessages(current => [
      ...current,
      userMessage,
      { id: assistantId, role: 'assistant', content: '' },
    ]);

    try {
      let conversationId = options.conversationId;

      // Check if context has changed to avoid redundant uploads
      const contextStringified = JSON.stringify(context.scope);
      const lastContextStringified = lastUploadedContextRef.current 
        ? JSON.stringify(lastUploadedContextRef.current.scope) 
        : '';
      const documentChanged = lastUploadedContextRef.current?.document !== options.document;
      const contextChanged = !lastUploadedContextRef.current || contextStringified !== lastContextStringified || documentChanged;

      if (!conversationId) {
        const created = await createConversation({
          projectId: options.projectId,
          fileName: options.fileName,
          ...context,
        });
        conversationId = created.conversationId;
        createdConversationRef.current = conversationId;
        lastUploadedContextRef.current = { scope: JSON.parse(JSON.stringify(context.scope)), document: options.document };
        await options.onConversationCreated(conversationId);
      } else if (contextChanged) {
        await replaceConversationContext(conversationId, context);
        lastUploadedContextRef.current = { scope: JSON.parse(JSON.stringify(context.scope)), document: options.document };
      }

      const controller = new AbortController();
      abortRef.current = controller;
      let usage: ChatUsage | undefined;

      await streamConversationMessage({
        conversationId,
        message,
        model: selectedModel || undefined,
        signal: controller.signal,
        onDelta: delta => {
          setMessages(current => current.map(item => (
            item.id === assistantId
              ? { ...item, content: item.content + delta }
              : item
          )));
        },
        onUsage: nextUsage => {
          usage = nextUsage;
        },
      });

      if (usage) {
        setMessages(current => current.map(item => (
          item.id === assistantId ? { ...item, usage } : item
        )));
      }
    } catch (sendError) {
      if (sendError instanceof DOMException && sendError.name === 'AbortError') {
        setError('Đã dừng phản hồi.');
      } else {
        const messageText = sendError instanceof Error ? sendError.message : 'Không thể gửi câu hỏi.';
        setError(messageText);
        setMessages(current => current.filter(item => (
          item.id !== userMessage.id && item.id !== assistantId
        )));
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, [isStreaming, options, selectedModel]);

  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !hasMoreMessages || !options.conversationId) return;
    setIsLoadingMore(true);
    try {
      const oldestMessageId = messages[0]?.id;
      if (!oldestMessageId) {
        setHasMoreMessages(false);
        return;
      }
      const limit = 10;
      const older = await getConversationMessages(options.conversationId, limit, oldestMessageId);
      if (older.length < limit) {
        setHasMoreMessages(false);
      }
      setMessages(current => [...older, ...current]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Không thể tải tin nhắn cũ.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMoreMessages, options.conversationId, messages]);

  return {
    messages,
    models,
    selectedModel,
    setSelectedModel,
    isLoadingHistory,
    isStreaming,
    error,
    sendMessage,
    stop,
    hasMoreMessages,
    isLoadingMore,
    loadMoreMessages,
  };
}

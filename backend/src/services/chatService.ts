import { getAiProvider } from '../providers/providerRegistry.js';
import {
  addAssistantMessage,
  addUserMessage,
  getContextUnits,
  getConversation,
  getRecentMessages,
  updateConversationTitle,
} from '../repositories/conversationRepository.js';
import { recordTokenUsage, reserveDailyRequest } from '../repositories/usageRepository.js';
import { buildDocumentContext } from './contextService.js';
import type { DocumentType } from '../schemas/conversation.js';
import { resolveAllowedModel } from './modelCatalogService.js';

interface StreamChatInput {
  uid: string;
  conversationId: string;
  message: string;
  model?: string;
  signal: AbortSignal;
  onDelta: (text: string) => void;
}

export async function streamChat(input: StreamChatInput) {
  const conversation = await getConversation(input.uid, input.conversationId);
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND');

  const serializedUnits = await getContextUnits(
    input.uid,
    input.conversationId,
    conversation.contextVersion,
  );
  if (serializedUnits.length === 0) throw new Error('CONVERSATION_CONTEXT_MISSING');

  const model = resolveAllowedModel(input.model);
  const provider = getAiProvider(model);
  const priorMessages = await getRecentMessages(input.uid, input.conversationId);
  const isFirstMessage = priorMessages.length === 0;
  const usageRef = await reserveDailyRequest(input.uid);

  await addUserMessage(
    input.uid,
    input.conversationId,
    input.message,
    conversation.contextVersion,
  );

  const result = await provider.streamCompletion({
    model,
    documentType: conversation.documentType,
    documentContext: buildDocumentContext(conversation.documentType, serializedUnits),
    messages: [...priorMessages, { role: 'user', content: input.message }],
    signal: input.signal,
    onDelta: input.onDelta,
  });

  await Promise.all([
    addAssistantMessage(
      input.uid,
      input.conversationId,
      result.text,
      conversation.contextVersion,
      result.model,
      { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    ),
    recordTokenUsage(usageRef, result.inputTokens, result.outputTokens),
  ]);

  if (isFirstMessage) {
    void generateAndSaveConversationTitle(
      input.uid,
      input.conversationId,
      input.message,
      model,
      conversation.documentType,
    );
  }

  return {
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    model: result.model,
  };
}

export async function generateAndSaveConversationTitle(
  uid: string,
  conversationId: string,
  firstMessage: string,
  model: string,
  documentType: DocumentType,
) {
  try {
    const provider = getAiProvider(model);
    const prompt = `Bạn là trợ lý AI. Hãy tạo một tiêu đề siêu ngắn gọn (từ 3 đến 5 từ tiếng Việt, không dấu ngoặc kép, không chứa từ "Hội thoại" hay "Trò chuyện") tóm tắt nội dung câu hỏi sau của người dùng để làm tiêu đề lịch sử chat.

Câu hỏi: "${firstMessage}"

Tiêu đề:`;

    const result = await provider.streamCompletion({
      model,
      documentType,
      documentContext: '',
      messages: [{ role: 'user', content: prompt }],
      signal: new AbortController().signal,
      onDelta: () => {},
    });

    const title = result.text.trim().replace(/^"|"$/g, '').slice(0, 50);
    if (title) {
      await updateConversationTitle(uid, conversationId, title);
    }
  } catch (e) {
    console.error('Failed to generate conversation title:', e);
  }
}

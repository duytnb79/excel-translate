import { FieldValue } from 'firebase-admin/firestore';
import { firestore } from '../lib/firebase.js';
import type {
  ConversationContext,
  CreateConversationInput,
  SheetContext,
} from '../schemas/conversation.js';
import type { ContextStats } from '../services/contextService.js';
import { serializeSheet } from '../services/contextService.js';

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
}

function conversationRef(uid: string, conversationId: string) {
  return firestore.doc(`users/${uid}/conversations/${conversationId}`);
}

async function storeContext(
  uid: string,
  conversationId: string,
  version: number,
  sheets: SheetContext[],
) {
  const batch = firestore.batch();
  const contexts = conversationRef(uid, conversationId).collection('contexts');

  for (const sheet of sheets) {
    batch.set(contexts.doc(`v${version}_sheet_${sheet.index}`), {
      version,
      sheetIndex: sheet.index,
      sheetName: sheet.name,
      serialized: serializeSheet(sheet),
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
}

export async function createConversation(
  uid: string,
  input: CreateConversationInput,
  contextStats: ContextStats,
) {
  const ref = firestore.collection(`users/${uid}/conversations`).doc();
  await ref.set({
    projectId: input.projectId,
    fileName: input.fileName,
    title: 'Hội thoại mới',
    scope: input.scope,
    contextVersion: 1,
    contextStats,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    totalInputTokens: 0,
    totalOutputTokens: 0,
  });
  await storeContext(uid, ref.id, 1, input.sheets);
  return { conversationId: ref.id, contextVersion: 1 };
}

export async function replaceConversationContext(
  uid: string,
  conversationId: string,
  input: ConversationContext,
  contextStats: ContextStats,
) {
  const ref = conversationRef(uid, conversationId);
  const version = await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error('CONVERSATION_NOT_FOUND');

    const nextVersion = Number(snapshot.get('contextVersion') || 0) + 1;
    transaction.update(ref, {
      scope: input.scope,
      contextVersion: nextVersion,
      contextStats,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return nextVersion;
  });

  await storeContext(uid, conversationId, version, input.sheets);
  return { conversationId, contextVersion: version };
}

export async function getConversation(uid: string, conversationId: string) {
  const ref = conversationRef(uid, conversationId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  return {
    ref,
    contextVersion: Number(snapshot.get('contextVersion') || 1),
  };
}

export async function getContextSheets(
  uid: string,
  conversationId: string,
  version: number,
) {
  const snapshot = await conversationRef(uid, conversationId)
    .collection('contexts')
    .where('version', '==', version)
    .get();

  return snapshot.docs
    .sort((a, b) => Number(a.get('sheetIndex')) - Number(b.get('sheetIndex')))
    .map(doc => String(doc.get('serialized')));
}

export async function getMessages(
  uid: string,
  conversationId: string,
  limit = 10,
  beforeId?: string,
): Promise<StoredMessage[] | null> {
  const conversation = await getConversation(uid, conversationId);
  if (!conversation) return null;

  let query = conversation.ref.collection('messages')
    .orderBy('createdAt', 'desc');

  if (beforeId) {
    const beforeDoc = await conversation.ref.collection('messages').doc(beforeId).get();
    if (beforeDoc.exists) {
      const createdAt = beforeDoc.get('createdAt');
      if (createdAt) {
        query = query.startAfter(createdAt);
      }
    }
  }

  const snapshot = await query.limit(limit).get();

  return snapshot.docs.reverse().map(doc => {
    const usage = doc.get('usage');
    const model = doc.get('model');
    return {
      id: doc.id,
      role: doc.get('role') as 'user' | 'assistant',
      content: String(doc.get('content') || ''),
      ...(usage ? { usage: { ...usage, model } } : {}),
    };
  });
}

export async function getRecentMessages(uid: string, conversationId: string) {
  const ref = conversationRef(uid, conversationId);
  const snapshot = await ref.collection('messages')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  return snapshot.docs.reverse().map(doc => ({
    role: doc.get('role') as 'user' | 'assistant',
    content: String(doc.get('content') || ''),
  }));
}

export async function addUserMessage(
  uid: string,
  conversationId: string,
  content: string,
  contextVersion: number,
) {
  await conversationRef(uid, conversationId).collection('messages').add({
    role: 'user',
    content,
    contextVersion,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function addAssistantMessage(
  uid: string,
  conversationId: string,
  content: string,
  contextVersion: number,
  model: string,
  usage: { inputTokens: number; outputTokens: number },
) {
  const ref = conversationRef(uid, conversationId);
  await ref.collection('messages').add({
    role: 'assistant',
    content,
    contextVersion,
    model,
    usage,
    createdAt: FieldValue.serverTimestamp(),
  });
  await ref.update({
    updatedAt: FieldValue.serverTimestamp(),
    totalInputTokens: FieldValue.increment(usage.inputTokens),
    totalOutputTokens: FieldValue.increment(usage.outputTokens),
  });
}

export async function listConversations(uid: string, projectId?: string) {
  let query: any = firestore.collection(`users/${uid}/conversations`);

  if (projectId) {
    query = query.where('projectId', '==', projectId);
  }

  const snapshot = await query.get();
  const list = snapshot.docs.map((doc: any) => ({
    id: doc.id,
    projectId: doc.get('projectId') as string,
    fileName: doc.get('fileName') as string,
    title: (doc.get('title') || 'Hội thoại mới') as string,
    scope: doc.get('scope'),
    totalInputTokens: (doc.get('totalInputTokens') || 0) as number,
    totalOutputTokens: (doc.get('totalOutputTokens') || 0) as number,
    createdAt: doc.get('createdAt')?.toDate()?.toISOString() as string | undefined,
    updatedAt: doc.get('updatedAt')?.toDate()?.toISOString() as string | undefined,
  }));

  list.sort((a: any, b: any) => {
    const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return timeB - timeA;
  });

  return list;
}

export async function updateConversationTitle(uid: string, conversationId: string, title: string) {
  const ref = conversationRef(uid, conversationId);
  await ref.update({ title });
}

export async function deleteConversation(uid: string, conversationId: string) {
  const ref = conversationRef(uid, conversationId);
  const batch = firestore.batch();

  const messages = await ref.collection('messages').get();
  for (const doc of messages.docs) {
    batch.delete(doc.ref);
  }

  const contexts = await ref.collection('contexts').get();
  for (const doc of contexts.docs) {
    batch.delete(doc.ref);
  }

  batch.delete(ref);
  await batch.commit();
}

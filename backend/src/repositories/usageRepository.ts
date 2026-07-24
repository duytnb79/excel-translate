import { FieldValue } from 'firebase-admin/firestore';
import { env } from '../config/env.js';
import { firestore } from '../lib/firebase.js';

export async function reserveDailyRequest(uid: string) {
  const day = new Date().toISOString().slice(0, 10);
  const usageRef = firestore.doc(`users/${uid}/usage/${day}`);

  await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(usageRef);
    const requests = Number(snapshot.get('requests') || 0);
    const totalTokens = Number(snapshot.get('totalTokens') || 0);

    if (requests >= env.DAILY_REQUEST_LIMIT || totalTokens >= env.DAILY_TOKEN_LIMIT) {
      throw new Error('DAILY_QUOTA_EXCEEDED');
    }

    transaction.set(usageRef, {
      requests: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return usageRef;
}

export async function recordTokenUsage(
  usageRef: FirebaseFirestore.DocumentReference,
  inputTokens: number,
  outputTokens: number,
) {
  await usageRef.set({
    inputTokens: FieldValue.increment(inputTokens),
    outputTokens: FieldValue.increment(outputTokens),
    totalTokens: FieldValue.increment(inputTokens + outputTokens),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

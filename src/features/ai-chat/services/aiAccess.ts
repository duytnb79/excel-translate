import { getFirebaseIdToken } from '../../../shared/services/firebase';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const STORAGE_KEY = 'ai_chat_access_key';

export function getAiAccessKey() {
  return sessionStorage.getItem(STORAGE_KEY) || '';
}

export function clearAiAccessKey() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export async function pairAiAccessKey(accessKey: string) {
  const normalizedKey = accessKey.trim();
  if (!normalizedKey) throw new Error('Vui lòng nhập secret key.');

  const token = await getFirebaseIdToken();
  const response = await fetch(`${API_BASE_URL}/api/access/verify`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-AI-Access-Key': normalizedKey,
    },
  });

  if (!response.ok) {
    clearAiAccessKey();
    throw new Error(response.status === 403
      ? 'Secret key không đúng hoặc đã hết hiệu lực.'
      : `Không thể xác thực quyền AI (${response.status}).`);
  }

  sessionStorage.setItem(STORAGE_KEY, normalizedKey);
}

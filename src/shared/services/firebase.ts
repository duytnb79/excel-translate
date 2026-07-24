import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth, type User } from 'firebase/auth';

const envConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let authPromise: Promise<Auth> | null = null;
let signInPromise: Promise<User> | null = null;

function hasRequiredConfig(config: FirebaseOptions) {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

async function loadFirebaseConfig() {
  if (hasRequiredConfig(envConfig)) return envConfig;

  const response = await fetch('/__/firebase/init.json');
  if (!response.ok) {
    throw new Error(
      'Thiếu cấu hình Firebase. Hãy cấu hình VITE_FIREBASE_* khi chạy local hoặc deploy bằng Firebase Hosting.',
    );
  }

  const hostedConfig = await response.json() as FirebaseOptions;
  if (!hasRequiredConfig(hostedConfig)) {
    throw new Error('Firebase Hosting không trả về đủ cấu hình Web App.');
  }
  return hostedConfig;
}

async function getFirebaseAuth() {
  authPromise ??= loadFirebaseConfig().then(config => getAuth(initializeApp(config)));
  return authPromise;
}

async function ensureUser(): Promise<User> {
  const auth = await getFirebaseAuth();
  if (auth.currentUser) return auth.currentUser;

  signInPromise ??= signInAnonymously(auth).then(result => result.user);
  try {
    return await signInPromise;
  } finally {
    signInPromise = null;
  }
}

export async function getFirebaseIdToken(): Promise<string> {
  const user = await ensureUser();
  return user.getIdToken();
}

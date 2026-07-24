const DB_NAME = 'SheetsTranslateDB';
const DB_VERSION = 2;
const STORE_METADATA = 'metadata';
const STORE_BUFFERS = 'buffers';

export interface ProjectMetadata {
  id: string;
  fileName: string;
  fileSizeStr: string;
  timestamp: number;
  activeSheetIndex: number;
  activeTab: 'original' | 'translated';
  targetLang: string;
  translatedLangs?: string[];
  aiConversationId?: string;
}

export interface ProjectBuffers {
  id: string;
  origBuffer: ArrayBuffer;
  transBuffer?: ArrayBuffer;
  translations?: { [langCode: string]: ArrayBuffer };
}

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      
      // Handle upgrade from version 1 or create new stores
      if (db.objectStoreNames.contains('state')) {
        db.deleteObjectStore('state');
      }
      
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BUFFERS)) {
        db.createObjectStore(STORE_BUFFERS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save or update project state (metadata and buffers)
 */
export async function saveProject(metadata: ProjectMetadata, buffers: ProjectBuffers): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_METADATA, STORE_BUFFERS], 'readwrite');
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    
    const metaStore = transaction.objectStore(STORE_METADATA);
    const bufferStore = transaction.objectStore(STORE_BUFFERS);
    
    metaStore.put(metadata);
    bufferStore.put(buffers);
  });
}

/**
 * Update project metadata only
 */
export async function updateProjectMetadata(metadata: ProjectMetadata): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_METADATA, 'readwrite');
    const store = transaction.objectStore(STORE_METADATA);
    const request = store.put(metadata);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get project metadata by ID
 */
export async function getProjectMetadata(id: string): Promise<ProjectMetadata | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_METADATA, 'readonly');
    const store = transaction.objectStore(STORE_METADATA);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load project buffers by ID
 */
export async function getProjectBuffers(id: string): Promise<ProjectBuffers | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_BUFFERS, 'readonly');
      const store = transaction.objectStore(STORE_BUFFERS);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to get project buffers:', err);
    return null;
  }
}

/**
 * List all projects sorted by timestamp (newest first)
 */
export async function listProjects(): Promise<ProjectMetadata[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_METADATA, 'readonly');
      const store = transaction.objectStore(STORE_METADATA);
      const request = store.getAll();
      request.onsuccess = () => {
        const list = request.result || [];
        // Sort descending by timestamp
        list.sort((a, b) => b.timestamp - a.timestamp);
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to list projects from database:', err);
    return [];
  }
}

/**
 * Delete project from database
 */
export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_METADATA, STORE_BUFFERS], 'readwrite');
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    
    const metaStore = transaction.objectStore(STORE_METADATA);
    const bufferStore = transaction.objectStore(STORE_BUFFERS);
    
    metaStore.delete(id);
    bufferStore.delete(id);
  });
}

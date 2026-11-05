import path from 'path';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { FileStore, createStore, Store } from './store.js';

export async function buildApp() {
  const config = loadConfig();
  if (config.missing.length > 0) {
    console.error(`[config] Faltan variables de entorno: ${config.missing.join(', ')}`);
  }
  // With configuration missing the app stays up and the screen lists what is needed.
  // The empty store is never used: every API route answers 503 before reaching it.
  const store: Store = config.missing.length > 0 ? new FileStore(path.join(config.dataDir, 'unused')) : await createStore(config);
  return { app: createApp(config, store), config };
}

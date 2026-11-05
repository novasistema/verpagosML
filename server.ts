import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { createApp } from './server/app';
import { loadConfig } from './server/config';
import { FileStore, createStore, Store } from './server/store';

dotenv.config({ path: ['.env.local', '.env'] });

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const config = loadConfig();

  if (config.missing.length > 0) {
    console.error(`[config] Faltan variables de entorno: ${config.missing.join(', ')}`);
  }

  // With configuration missing the app stays up and the screen lists what is needed.
  // The empty store is never used: every API route answers 503 before reaching it.
  const store: Store = config.missing.length > 0 ? new FileStore(path.join(config.dataDir, 'unused')) : await createStore(config);

  const app = createApp(config, store);

  if (!config.production) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('No se pudo iniciar el servidor:', err);
  process.exit(1);
});

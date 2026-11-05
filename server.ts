import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { buildApp } from './server/boot.js';

dotenv.config({ path: ['.env.local', '.env'] });

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const { app, config } = await buildApp();

  if (!config.production) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // The server bundle sits in dist/ too: it must not be downloadable.
    app.use((req, res, next) => {
      if (req.path.startsWith('/server.cjs')) res.status(404).end();
      else next();
    });
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

import type { IncomingMessage, ServerResponse } from 'http';
import { buildApp } from '../server/boot.js';

// Vercel entry point: all /api routes arrive here (see vercel.json).
const ready = buildApp();

/** Puts back the original path if the platform delivers the rewrite's destination instead. */
export function originalUrl(url: string): string {
  const parsed = new URL(url, 'http://local');
  const path = parsed.searchParams.get('path');
  parsed.searchParams.delete('path');
  const pathname = parsed.pathname === '/api/index' && path !== null ? `/api/${path}` : parsed.pathname;
  return `${pathname}${parsed.search}`;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const { app } = await ready;
  req.url = originalUrl(req.url || '/');
  app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}

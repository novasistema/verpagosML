import fs from 'fs';
import path from 'path';
import { randomToken } from './security';

export interface AppConfig {
  production: boolean;
  appUrl: string | null;
  appSecret: string;
  mpClientId: string;
  mpClientSecret: string;
  mpWebhookSecret: string;
  mpApiBase: string;
  mpAuthBase: string;
  registrationCode: string;
  allowSimulation: boolean;
  allowTestPayments: boolean;
  syncIntervalMs: number;
  firebaseServiceAccount: string;
  firestoreDatabaseId: string;
  dataDir: string;
  /** Names of the variables that block the app from running in production. */
  missing: string[];
}

function validUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** In development only: a random secret kept on disk so sessions survive restarts. */
function developmentSecret(dataDir: string): string {
  const file = path.join(dataDir, '.dev-secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = randomToken(32);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === 'production';
  const dataDir = env.DATA_DIR || path.join(process.cwd(), 'data');
  const appUrl = validUrl(env.APP_URL);

  const required: Record<string, boolean> = {
    APP_URL: Boolean(appUrl),
    APP_SECRET: (env.APP_SECRET || '').length >= 32,
    MERCADOPAGO_CLIENT_ID: Boolean(env.MERCADOPAGO_CLIENT_ID),
    MERCADOPAGO_CLIENT_SECRET: Boolean(env.MERCADOPAGO_CLIENT_SECRET),
    MERCADOPAGO_WEBHOOK_SECRET: Boolean(env.MERCADOPAGO_WEBHOOK_SECRET),
    REGISTRATION_CODE: Boolean(env.REGISTRATION_CODE),
    FIREBASE_SERVICE_ACCOUNT: Boolean(env.FIREBASE_SERVICE_ACCOUNT),
  };
  const missing = production ? Object.keys(required).filter((name) => !required[name]) : [];

  return {
    production,
    appUrl,
    appSecret: required.APP_SECRET ? env.APP_SECRET! : production ? '' : developmentSecret(dataDir),
    mpClientId: env.MERCADOPAGO_CLIENT_ID || '',
    mpClientSecret: env.MERCADOPAGO_CLIENT_SECRET || '',
    mpWebhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET || '',
    mpApiBase: env.MP_API_BASE || 'https://api.mercadopago.com',
    mpAuthBase: env.MP_AUTH_BASE || 'https://auth.mercadopago.com',
    registrationCode: env.REGISTRATION_CODE || '',
    allowSimulation: env.ALLOW_SIMULATION ? env.ALLOW_SIMULATION === 'true' : !production,
    allowTestPayments: env.ALLOW_TEST_PAYMENTS === 'true',
    syncIntervalMs: Number(env.MP_SYNC_INTERVAL_MS) || 20_000,
    firebaseServiceAccount: env.FIREBASE_SERVICE_ACCOUNT || '',
    firestoreDatabaseId: env.FIRESTORE_DATABASE_ID || '',
    dataDir,
    missing,
  };
}

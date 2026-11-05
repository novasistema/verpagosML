import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/** Derives independent keys (sessions, encryption, lookups) from the single APP_SECRET. */
export class Keyring {
  private readonly sessionKey: Buffer;
  private readonly encryptionKey: Buffer;
  private readonly lookupKey: Buffer;

  constructor(secret: string) {
    const derive = (label: string) =>
      Buffer.from(crypto.hkdfSync('sha256', secret, 'corroborador-pagos', label, 32));
    this.sessionKey = derive('session');
    this.encryptionKey = derive('encryption');
    this.lookupKey = derive('lookup');
  }

  /** AES-256-GCM: Mercado Pago tokens are never stored in clear text. */
  encrypt(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
  }

  decrypt(payload: string): string {
    const [version, iv, tag, data] = payload.split('.');
    if (version !== 'v1' || !iv || !tag || data === undefined) throw new Error('Cifrado inválido');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }

  /** Deterministic hash that lets us find a merchant by seller code without storing the code readable. */
  lookupHash(value: string): string {
    return crypto.createHmac('sha256', this.lookupKey).update(value).digest('hex');
  }

  sign<T extends object>(data: T): string {
    const body = Buffer.from(JSON.stringify(data)).toString('base64url');
    const mac = crypto.createHmac('sha256', this.sessionKey).update(body).digest('base64url');
    return `${body}.${mac}`;
  }

  verify<T>(token: string | undefined): T | null {
    if (!token) return null;
    const [body, mac] = token.split('.');
    if (!body || !mac) return null;
    const expected = crypto.createHmac('sha256', this.sessionKey).update(body).digest();
    const given = Buffer.from(mac, 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    } catch {
      return null;
    }
  }
}

export function randomToken(bytes = 18): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Validates Mercado Pago's `x-signature` header.
 * Signed text: id:<data.id from the URL, lowercased>;request-id:<x-request-id>;ts:<ts>;
 * Parts whose value is missing are left out of the signed text.
 */
export function verifyWebhookSignature(params: {
  secret: string;
  signatureHeader?: string;
  requestId?: string;
  dataId?: string;
}): boolean {
  const { secret, signatureHeader, requestId, dataId } = params;
  if (!signatureHeader) return false;
  let ts = '';
  let v1 = '';
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.split('=').map((s) => s.trim());
    if (key === 'ts') ts = value ?? '';
    if (key === 'v1') v1 = value ?? '';
  }
  if (!ts || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;

  let manifest = '';
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const expected = crypto.createHmac('sha256', secret).update(manifest).digest();
  const given = Buffer.from(v1, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

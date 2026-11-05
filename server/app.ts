import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import type { AppConfig } from './config';
import { MP_SEARCH_PAGE, MercadoPagoClient, MpError, MpRawPayment, isCollectedBy, mapPayment } from './mercadopago';
import { Keyring, hashPassword, randomToken, verifyPassword, verifyWebhookSignature } from './security';
import { EmailTakenError, Store } from './store';
import type { Merchant, PaymentRecord, Role, SessionData } from './types';

const SESSION_COOKIE = 'cp_session';
const OAUTH_COOKIE = 'cp_oauth';
const SESSION_DAYS = 30;
const CSRF_HEADER = 'x-requested-with';
const REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000;
/** On connecting, payments older than this are not brought in as new. */
const IMPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

interface Ctx {
  merchant: Merchant;
  session: SessionData;
}
type AuthedRequest = Request & { ctx: Ctx };

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const normalizeEmail = (value: unknown) => text(value, 200).toLowerCase();

export function createApp(config: AppConfig, store: Store) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const keys = config.appSecret ? new Keyring(config.appSecret) : null;
  const mp = new MercadoPagoClient({
    apiBase: config.mpApiBase,
    authBase: config.mpAuthBase,
    clientId: config.mpClientId,
    clientSecret: config.mpClientSecret,
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const baseUrl = (req: Request) => config.appUrl || `${req.protocol}://${req.get('host')}`;
  const redirectUri = (req: Request) => `${baseUrl(req)}/api/auth/mercadopago/callback`;

  function readCookie(req: Request, name: string): string | undefined {
    for (const part of (req.headers.cookie || '').split(';')) {
      const index = part.indexOf('=');
      if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
    }
    return undefined;
  }

  function setCookie(req: Request, res: Response, name: string, value: string, maxAgeSeconds: number) {
    const secure = req.secure;
    // The AI Studio preview runs inside an iframe, where only SameSite=None cookies work.
    const sameSite = !config.production && secure ? 'None; Partitioned' : 'Lax';
    const flags = [`Path=/`, `HttpOnly`, `SameSite=${sameSite}`, `Max-Age=${maxAgeSeconds}`];
    if (secure) flags.push('Secure');
    res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; ${flags.join('; ')}`);
  }

  function startSession(req: Request, res: Response, merchant: Merchant, role: Role, name: string) {
    const session: SessionData = {
      mid: merchant.id,
      role,
      name,
      ver: role === 'owner' ? merchant.ownerSessionVersion : merchant.sellerSessionVersion,
      exp: Date.now() + SESSION_DAYS * 86_400_000,
    };
    setCookie(req, res, SESSION_COOKIE, keys!.sign(session), SESSION_DAYS * 86_400);
  }

  async function loadContext(req: Request): Promise<Ctx | null> {
    const session = keys!.verify<SessionData>(readCookie(req, SESSION_COOKIE));
    if (!session || session.exp < Date.now()) return null;
    const merchant = await store.getMerchant(session.mid);
    if (!merchant || merchant.active === false) return null;
    const version = session.role === 'owner' ? merchant.ownerSessionVersion : merchant.sellerSessionVersion;
    return session.ver === version ? { merchant, session } : null;
  }

  const requireAuth = (handler: (req: AuthedRequest, res: Response) => Promise<void> | void) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ctx = await loadContext(req);
        if (!ctx) {
          res.status(401).json({ error: 'Tu sesión terminó. Volvé a ingresar.' });
          return;
        }
        (req as AuthedRequest).ctx = ctx;
        await handler(req as AuthedRequest, res);
      } catch (err) {
        next(err);
      }
    };

  const requireOwner = (handler: (req: AuthedRequest, res: Response) => Promise<void> | void) =>
    requireAuth(async (req, res) => {
      if (req.ctx.session.role !== 'owner') {
        res.status(403).json({ error: 'Solo el dueño puede hacer esto.' });
        return;
      }
      await handler(req, res);
    });

  const publicRoute = (handler: (req: Request, res: Response) => Promise<void> | void) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await handler(req, res);
      } catch (err) {
        next(err);
      }
    };

  // Brute-force brake for login-type routes. Per instance: enough to slow down an attack.
  const attempts = new Map<string, { count: number; resetAt: number }>();
  function tooManyAttempts(req: Request, res: Response, scope: string): boolean {
    const entry = attempts.get(`${scope}:${req.ip}`);
    if (entry && entry.resetAt > Date.now() && entry.count >= 10) {
      res.status(429).json({ error: 'Demasiados intentos. Esperá 15 minutos y probá de nuevo.' });
      return true;
    }
    return false;
  }

  /** Only failures count, so a shop with many devices on one connection isn't locked out. */
  function recordFailure(req: Request, scope: string) {
    const now = Date.now();
    if (attempts.size > 10_000) {
      for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
    }
    const key = `${scope}:${req.ip}`;
    const entry = attempts.get(key);
    if (!entry || entry.resetAt < now) attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    else entry.count += 1;
  }

  function publicMpStatus(merchant: Merchant, role: Role) {
    const conn = merchant.mp;
    return {
      configured: conn?.state === 'active',
      needsReauth: conn?.state === 'needs_reauth',
      oauthReady: mp.oauthConfigured,
      linkedAccount: conn
        ? {
            id: conn.userId,
            nickname: conn.nickname,
            email: role === 'owner' ? conn.email : '',
            firstName: conn.firstName,
            lastName: conn.lastName,
            linkedAt: conn.linkedAt,
            state: conn.state,
          }
        : null,
      revision: merchant.revision || 0,
    };
  }

  // -------------------------------------------------------------------------
  // Live updates to this merchant's open screens only
  // -------------------------------------------------------------------------
  const channels = new Map<string, Set<Response>>();

  function broadcast(merchantId: string, event: string, data: unknown) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of channels.get(merchantId) || []) {
      try {
        client.write(message);
      } catch {
        channels.get(merchantId)?.delete(client);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Mercado Pago tokens and payments
  // -------------------------------------------------------------------------
  const refreshes = new Map<string, Promise<Merchant>>();

  /**
   * Gets new tokens. Refresh tokens are single-use and several instances may try at once,
   * so every write is conditional: a stale instance can't overwrite newer tokens or undo a disconnect.
   */
  function refreshConnection(merchant: Merchant, accessRejected = false): Promise<Merchant> {
    const running = refreshes.get(merchant.id);
    if (running) return running;
    const work = (async () => {
      const conn = merchant.mp!;
      try {
        const tokens = await mp.refresh(keys!.decrypt(conn.refreshTokenEnc));
        const updated = {
          ...conn,
          state: 'active' as const,
          accessTokenEnc: keys!.encrypt(tokens.access_token),
          refreshTokenEnc: keys!.encrypt(tokens.refresh_token),
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        };
        if (await store.updateMpIfUnchanged(merchant.id, conn.refreshTokenEnc, updated)) {
          if (conn.state !== 'active') broadcast(merchant.id, 'account:changed', {});
          return { ...merchant, mp: updated };
        }
        const fresh = await store.getMerchant(merchant.id);
        if (fresh?.mp) return fresh;
        throw new MpError(401, 'La cuenta se desconectó durante la renovación');
      } catch (err) {
        if (!(err instanceof MpError) || err.status < 400 || err.status >= 500 || err.status === 429) throw err;
        // Only a refused grant, or an access token that no longer works, means reconnecting.
        const expired = new Date(conn.expiresAt).getTime() < Date.now();
        if (!accessRejected && !expired && !/invalid_grant/i.test(err.message)) throw err;

        await new Promise((resolve) => setTimeout(resolve, config.refreshSettleMs));
        const fresh = await store.getMerchant(merchant.id);
        if (fresh?.mp && fresh.mp.refreshTokenEnc !== conn.refreshTokenEnc) return fresh;
        await store.updateMpIfUnchanged(merchant.id, conn.refreshTokenEnc, { ...conn, state: 'needs_reauth' });
        broadcast(merchant.id, 'account:changed', {});
        throw err;
      }
    })().finally(() => refreshes.delete(merchant.id));
    refreshes.set(merchant.id, work);
    return work;
  }

  async function withToken<T>(merchant: Merchant, call: (token: string) => Promise<T>): Promise<T> {
    let current = merchant;
    if (!current.mp) throw new MpError(401, 'Sin cuenta de Mercado Pago conectada');
    const active = current.mp.state === 'active';
    if (active && new Date(current.mp.expiresAt).getTime() - Date.now() < REFRESH_MARGIN_MS) {
      try {
        current = await refreshConnection(current);
      } catch (err) {
        // Still valid for days: a failed early renewal must not stop payments.
        if (new Date(current.mp!.expiresAt).getTime() < Date.now()) throw err;
        console.warn('[mp] Renovación anticipada falló:', (err as Error).message);
      }
    }
    try {
      return await call(keys!.decrypt(current.mp!.accessTokenEnc));
    } catch (err) {
      // Already known to be refused: don't call the token endpoint on every poll.
      if (!(err instanceof MpError) || err.status !== 401 || !active) throw err;
      current = await refreshConnection(current, true);
      return call(keys!.decrypt(current.mp!.accessTokenEnc));
    }
  }

  function canIngest(merchant: Merchant, raw: MpRawPayment): boolean {
    if (!merchant.mp || !isCollectedBy(raw, merchant.mp.userId)) return false;
    if (raw.live_mode !== true && !config.allowTestPayments) return false;
    return true;
  }

  /** Old payments can't enter as new: a late refund notification must not ring the bell. */
  async function ingest(merchant: Merchant, raw: MpRawPayment, source: PaymentRecord['source']) {
    const notBefore = new Date(merchant.mp!.linkedAt).getTime() - IMPORT_WINDOW_MS;
    const result = await store.upsertPayment(merchant.id, mapPayment(raw), source, notBefore);
    if (result?.changed) broadcast(merchant.id, 'payments:changed', { id: result.payment.id, created: result.created });
    return result;
  }

  /**
   * After a disconnect or account change, Mercado Pago can no longer update these payments,
   * so a pending one can't be trusted or accepted. Screens treat this as "not approved".
   */
  function forScreen(merchant: Merchant, payment: PaymentRecord): PaymentRecord {
    const stale =
      payment.source !== 'simulation' &&
      payment.saleVerification.status === 'pending' &&
      payment.collectorId !== merchant.mpUserId;
    return stale ? { ...payment, status: 'other_account' } : payment;
  }

  const lastSync = new Map<string, number>();
  const syncing = new Map<string, Promise<number>>();
  const seenVersions = new Map<string, Map<string, string>>();

  /**
   * Reads recent payments directly from Mercado Pago. Together with the webhook it
   * guarantees a payment still shows up if a notification is lost or never sent.
   */
  function syncMerchant(merchant: Merchant): Promise<number> {
    const running = syncing.get(merchant.id);
    if (running) return running;
    lastSync.set(merchant.id, Date.now());
    const work = (async () => {
      const seen = seenVersions.get(merchant.id) || new Map<string, string>();
      if (seen.size > 2000) seen.clear();
      seenVersions.set(merchant.id, seen);
      let added = 0;
      for (let offset = 0; offset < MP_SEARCH_PAGE * 4; offset += MP_SEARCH_PAGE) {
        const page = await withToken(merchant, (token) => mp.searchRecentPayments(token, offset));
        let anyNew = false;
        for (const raw of page) {
          if (!canIngest(merchant, raw)) continue;
          // Skips the database when nothing changed: this runs often and on every shop.
          const version = `${raw.status}|${raw.status_detail}|${raw.date_last_updated}`;
          const id = String(raw.id);
          if (seen.get(id) === version) continue;
          anyNew = true;
          const result = await ingest(merchant, raw, 'api_sync');
          if (result?.created) added += 1;
          seen.set(id, version);
        }
        if (!anyNew || page.length < MP_SEARCH_PAGE) break;
      }
      return added;
    })().finally(() => syncing.delete(merchant.id));
    syncing.set(merchant.id, work);
    return work;
  }

  // -------------------------------------------------------------------------
  // Base middleware
  // -------------------------------------------------------------------------
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Tells the operator exactly what is missing instead of failing silently.
  app.get('/api/session', publicRoute(async (req, res) => {
    const base = {
      setupMissing: config.missing,
      storage: store?.kind ?? null,
      allowSimulation: config.allowSimulation,
      registrationRequiresCode: Boolean(config.registrationCode),
    };
    if (config.missing.length > 0 || !keys) {
      res.json({ authenticated: false, ...base });
      return;
    }
    const ctx = await loadContext(req);
    res.json(
      ctx
        ? {
            authenticated: true,
            role: ctx.session.role,
            userName: ctx.session.name,
            businessName: ctx.merchant.businessName,
            ...base,
          }
        : { authenticated: false, ...base },
    );
  }));

  app.use('/api', (req, res, next) => {
    if (config.missing.length > 0 || !keys) {
      res.status(503).json({ error: 'La aplicación todavía no está configurada.', setupMissing: config.missing });
      return;
    }
    next();
  });

  // Browsers can't add this header from another site without permission, which blocks CSRF.
  app.use('/api', (req, res, next) => {
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (isWrite && req.path !== '/webhooks/mercadopago' && req.get(CSRF_HEADER) !== 'corroborador') {
      res.status(403).json({ error: 'Solicitud no permitida.' });
      return;
    }
    next();
  });

  // -------------------------------------------------------------------------
  // Accounts
  // -------------------------------------------------------------------------
  app.post('/api/auth/register', publicRoute(async (req, res) => {
    if (tooManyAttempts(req, res, 'register')) return;
    const businessName = text(req.body?.businessName, 80);
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const code = text(req.body?.registrationCode, 200);

    if (config.registrationCode) {
      const given = crypto.createHash('sha256').update(code).digest();
      const expected = crypto.createHash('sha256').update(config.registrationCode).digest();
      if (!crypto.timingSafeEqual(given, expected)) {
        recordFailure(req, 'register');
        res.status(403).json({ error: 'El código de activación no es válido.' });
        return;
      }
    }
    if (!businessName) {
      res.status(400).json({ error: 'Ingresá el nombre del comercio.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Ingresá un email válido.' });
      return;
    }
    if (password.length < 8 || password.length > 200) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
      return;
    }

    const sellerCode = randomToken();
    const merchant: Merchant = {
      id: crypto.randomUUID(),
      businessName,
      ownerEmail: email,
      passwordHash: await hashPassword(password),
      active: true,
      createdAt: new Date().toISOString(),
      ownerSessionVersion: 1,
      sellerSessionVersion: 1,
      sellerCodeHash: keys!.lookupHash(sellerCode),
      sellerCodeEnc: keys!.encrypt(sellerCode),
      mpUserId: null,
      mp: null,
      revision: 0,
    };
    try {
      await store.createMerchant(merchant);
    } catch (err) {
      if (err instanceof EmailTakenError) {
        res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
        return;
      }
      throw err;
    }
    startSession(req, res, merchant, 'owner', 'Dueño');
    res.status(201).json({ success: true });
  }));

  app.post('/api/auth/login', publicRoute(async (req, res) => {
    if (tooManyAttempts(req, res, 'login')) return;
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const merchant = await store.findMerchantByEmail(normalizeEmail(req.body?.email));
    const valid = merchant ? await verifyPassword(password, merchant.passwordHash) : false;
    if (!merchant || !valid) {
      recordFailure(req, 'login');
      res.status(401).json({ error: 'Email o contraseña incorrectos.' });
      return;
    }
    if (merchant.active === false) {
      res.status(403).json({ error: 'Esta cuenta está suspendida. Comunicate con tu proveedor.' });
      return;
    }
    startSession(req, res, merchant, 'owner', 'Dueño');
    res.json({ success: true });
  }));

  app.post('/api/auth/seller-login', publicRoute(async (req, res) => {
    if (tooManyAttempts(req, res, 'seller')) return;
    const name = text(req.body?.name, 60);
    const code = text(req.body?.code, 200);
    if (!name) {
      res.status(400).json({ error: 'Ingresá tu nombre.' });
      return;
    }
    const merchant = code ? await store.findMerchantBySellerCodeHash(keys!.lookupHash(code)) : null;
    if (!merchant || merchant.active === false) {
      recordFailure(req, 'seller');
      res.status(401).json({ error: 'El enlace de acceso no es válido o fue reemplazado. Pedile uno nuevo al dueño.' });
      return;
    }
    startSession(req, res, merchant, 'seller', name);
    res.json({ success: true });
  }));

  app.post('/api/auth/logout', (req, res) => {
    setCookie(req, res, SESSION_COOKIE, '', 0);
    res.json({ success: true });
  });

  // -------------------------------------------------------------------------
  // Team
  // -------------------------------------------------------------------------
  app.get('/api/team/invite', requireOwner((req, res) => {
    const code = keys!.decrypt(req.ctx.merchant.sellerCodeEnc);
    res.json({ code, url: `${baseUrl(req)}/?acceso=${encodeURIComponent(code)}` });
  }));

  app.post('/api/team/invite/rotate', requireOwner(async (req, res) => {
    const code = randomToken();
    await store.updateMerchant(req.ctx.merchant.id, {
      sellerCodeHash: keys!.lookupHash(code),
      sellerCodeEnc: keys!.encrypt(code),
      sellerSessionVersion: req.ctx.merchant.sellerSessionVersion + 1,
    });
    res.json({ code, url: `${baseUrl(req)}/?acceso=${encodeURIComponent(code)}` });
  }));

  // -------------------------------------------------------------------------
  // Connecting Mercado Pago (OAuth with one single application)
  // -------------------------------------------------------------------------
  app.post('/api/auth/mercadopago/start', requireOwner((req, res) => {
    if (!mp.oauthConfigured) {
      res.status(503).json({ error: 'La conexión con Mercado Pago todavía no está habilitada en esta instalación.' });
      return;
    }
    const nonce = randomToken();
    const state = keys!.sign({ mid: req.ctx.merchant.id, nonce, exp: Date.now() + 600_000 });
    setCookie(req, res, OAUTH_COOKIE, nonce, 600);
    res.json({ authUrl: mp.authorizationUrl(state, redirectUri(req)) });
  }));

  app.get('/api/auth/mercadopago/callback', publicRoute(async (req, res) => {
    const fail = (code: string) => res.redirect(`/?mp_error=${code}`);
    const finish = () => setCookie(req, res, OAUTH_COOKIE, '', 0);

    const state = keys!.verify<{ mid: string; nonce: string; exp: number }>(text(req.query.state, 2000));
    const ctx = await loadContext(req);
    const nonce = readCookie(req, OAUTH_COOKIE);
    finish();

    if (req.query.error) return void fail('cancelled');
    if (
      !state ||
      state.exp < Date.now() ||
      !nonce ||
      state.nonce !== nonce ||
      !ctx ||
      ctx.session.role !== 'owner' ||
      ctx.merchant.id !== state.mid
    ) {
      return void fail('invalid_state');
    }
    const code = text(req.query.code, 500);
    if (!code) return void fail('no_code');

    try {
      const tokens = await mp.exchangeCode(code, redirectUri(req));
      const mpUserId = String(tokens.user_id);

      const profile = await mp.getProfile(tokens.access_token);
      if (!(await store.claimMpUser(ctx.merchant.id, mpUserId))) return void fail('already_linked');

      const previous = ctx.merchant.mpUserId;
      await store.updateMerchant(ctx.merchant.id, {
        revision: (ctx.merchant.revision || 0) + 1,
        mpUserId,
        mp: {
          userId: mpUserId,
          nickname: profile.nickname || `${profile.first_name || 'Cuenta'} ${profile.last_name || ''}`.trim(),
          email: profile.email || '',
          firstName: profile.first_name,
          lastName: profile.last_name,
          countryId: profile.country_id,
          siteId: profile.site_id,
          linkedAt: new Date().toISOString(),
          accessTokenEnc: keys!.encrypt(tokens.access_token),
          refreshTokenEnc: keys!.encrypt(tokens.refresh_token),
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          state: 'active',
        },
      });
      if (previous && previous !== mpUserId) await store.releaseMpUser(ctx.merchant.id, previous);
      seenVersions.delete(ctx.merchant.id);
      lastSync.delete(ctx.merchant.id);
      broadcast(ctx.merchant.id, 'account:changed', {});
      res.redirect('/?mp_linked=true');
    } catch (err) {
      console.error('[oauth] Falló el intercambio:', (err as Error).message);
      fail('exchange_failed');
    }
  }));

  app.post('/api/auth/mercadopago/unlink', requireOwner(async (req, res) => {
    const { merchant } = req.ctx;
    await store.updateMerchant(merchant.id, { mp: null, mpUserId: null, revision: (merchant.revision || 0) + 1 });
    if (merchant.mpUserId) await store.releaseMpUser(merchant.id, merchant.mpUserId);
    seenVersions.delete(req.ctx.merchant.id);
    broadcast(req.ctx.merchant.id, 'account:changed', {});
    res.json({ success: true });
  }));

  // -------------------------------------------------------------------------
  // Status and payments
  // -------------------------------------------------------------------------
  app.get('/api/status', requireAuth((req, res) => {
    res.json({
      ...publicMpStatus(req.ctx.merchant, req.ctx.session.role),
      appUrl: baseUrl(req),
      connectedDevices: Math.max(1, channels.get(req.ctx.merchant.id)?.size || 0),
    });
  }));

  app.get('/api/events', requireAuth((req, res) => {
    const merchantId = req.ctx.merchant.id;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.write(': conectado\n\n');
    const clients = channels.get(merchantId) || new Set<Response>();
    channels.set(merchantId, clients);
    clients.add(res);
    broadcast(merchantId, 'devices:count', { connectedDevices: clients.size });

    const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
      if (clients.size === 0) channels.delete(merchantId);
      else broadcast(merchantId, 'devices:count', { connectedDevices: clients.size });
    });
  }));

  // Screens poll this. It also drives the periodic read from Mercado Pago, because
  // Cloud Run gives no CPU to background timers between requests.
  app.get('/api/payments', requireAuth(async (req, res) => {
    let merchant = req.ctx.merchant;
    const due = Date.now() - (lastSync.get(merchant.id) || 0) >= config.syncIntervalMs;
    // Even after a refused renewal the current token may work for days: keep payments coming.
    const usable = merchant.mp && (merchant.mp.state === 'active' || new Date(merchant.mp.expiresAt).getTime() > Date.now());
    if (usable && due) {
      try {
        await syncMerchant(merchant);
        merchant = (await store.getMerchant(merchant.id)) || merchant;
      } catch (err) {
        console.warn(`[sync] ${merchant.id}:`, (err as Error).message);
        merchant = (await store.getMerchant(merchant.id)) || merchant;
      }
    }
    const status = publicMpStatus(merchant, req.ctx.session.role);
    if (req.query.since !== undefined && String(req.query.since) === String(merchant.revision || 0)) {
      res.json({ unchanged: true, status });
      return;
    }
    const payments = await store.listPayments(merchant.id, 200);
    res.json({ payments: payments.map((p) => forScreen(merchant, p)), status });
  }));

  app.post('/api/mercadopago/sync', requireAuth(async (req, res) => {
    const { merchant } = req.ctx;
    if (!merchant.mp) {
      res.status(400).json({ error: 'Primero conectá la cuenta de Mercado Pago.' });
      return;
    }
    if (merchant.mp.state !== 'active') {
      res.status(409).json({ error: 'Mercado Pago pide volver a autorizar la cuenta. El dueño debe reconectarla.' });
      return;
    }
    try {
      seenVersions.delete(merchant.id);
      res.json({ success: true, count: await syncMerchant(merchant) });
    } catch (err) {
      console.warn(`[sync] ${merchant.id}:`, (err as Error).message);
      res.status(502).json({ error: 'Mercado Pago no respondió. Probá de nuevo en un momento.' });
    }
  }));

  app.post('/api/payments/:id/verify-sale', requireAuth(async (req, res) => {
    const { merchant, session } = req.ctx;
    const rejected = req.body?.status === 'rejected';

    if (!rejected) {
      const current = await store.getPayment(merchant.id, req.params.id);
      if (current && current.source !== 'simulation') {
        if (current.collectorId !== merchant.mpUserId) {
          res.status(409).json({
            error: 'Este pago es de una cuenta de Mercado Pago que ya no está conectada. No se puede aceptar.',
            payment: forScreen(merchant, current),
          });
          return;
        }
        // Last look right before accepting: it may have been refunded seconds ago.
        // If Mercado Pago can't answer, the status it last confirmed stands.
        try {
          const raw = await withToken(merchant, (token) => mp.getPayment(token, current.id));
          if (canIngest(merchant, raw)) await ingest(merchant, raw, current.source);
        } catch (err) {
          console.warn(`[verify] ${current.id}:`, (err as Error).message);
        }
      }
    }
    const result = await store.decideSale(merchant.id, req.params.id, {
      status: rejected ? 'rejected' : 'accepted',
      acceptedAt: new Date().toISOString(),
      acceptedBy: session.role === 'owner' ? 'Dueño' : session.name, // from the session, not from the screen
      saleTicketNumber: text(req.body?.saleTicketNumber, 60) || `VTA-${Date.now().toString().slice(-6)}`,
      productOrConcept: text(req.body?.productOrConcept, 200),
      internalNotes: text(req.body?.internalNotes, 500),
    });
    if (result.outcome === 'not_found') {
      res.status(404).json({ error: 'Pago no encontrado.' });
    } else if (result.outcome === 'not_approved') {
      res.status(409).json({ error: 'Mercado Pago todavía no aprobó este pago. No se puede aceptar.', payment: result.payment });
    } else if (result.outcome === 'already_decided') {
      res.status(409).json({ error: `Este pago ya fue resuelto por ${result.payment.saleVerification.acceptedBy}.`, payment: result.payment });
    } else {
      broadcast(merchant.id, 'payments:changed', { id: result.payment.id });
      res.json({ success: true, payment: result.payment });
    }
  }));

  // Only outside production, or when explicitly enabled. Always labelled as a simulation.
  app.post('/api/payments/simulate', requireOwner(async (req, res) => {
    if (!config.allowSimulation) {
      res.status(404).json({ error: 'No disponible.' });
      return;
    }
    const amount = (Math.floor(Math.random() * 65) + 12) * 1000;
    const { payment } = await store.upsertPayment(
      req.ctx.merchant.id,
      {
        id: `SIM-${Date.now()}`,
        dateCreated: new Date().toISOString(),
        dateApproved: new Date().toISOString(),
        status: 'approved',
        statusDetail: 'simulated',
        transactionAmount: amount,
        netReceivedAmount: amount,
        feeAmount: 0,
        currencyId: 'ARS',
        paymentMethodId: 'simulacion',
        paymentTypeId: 'simulation',
        installments: 1,
        description: 'SIMULACIÓN - No es dinero real',
        payer: { firstName: 'Cliente', lastName: 'de Prueba', fullName: 'Cliente de Prueba', email: '' },
      },
      'simulation',
    ) as { payment: PaymentRecord };
    broadcast(req.ctx.merchant.id, 'payments:changed', { id: payment.id, created: true });
    res.json({ success: true, payment });
  }));

  app.post('/api/devices/ping', requireAuth((req, res) => {
    broadcast(req.ctx.merchant.id, 'devices:ping', { timestamp: new Date().toISOString() });
    res.json({ success: true, activeDevices: channels.get(req.ctx.merchant.id)?.size || 0 });
  }));

  // -------------------------------------------------------------------------
  // Mercado Pago webhook: one URL for the whole app.
  // A notification is only a hint: amount and status are always read back from
  // Mercado Pago with the merchant's own token. It can never create a payment by itself.
  // -------------------------------------------------------------------------
  app.post('/api/webhooks/mercadopago', publicRoute(async (req, res) => {
    const dataId = typeof req.query['data.id'] === 'string' ? req.query['data.id'] : undefined;

    if (config.mpWebhookSecret) {
      const valid = verifyWebhookSignature({
        secret: config.mpWebhookSecret,
        signatureHeader: req.get('x-signature'),
        requestId: req.get('x-request-id'),
        dataId,
      });
      if (!valid) {
        console.warn('[webhook] Firma inválida, notificación descartada');
        res.status(401).send('Firma inválida');
        return;
      }
    }

    const type = req.body?.type || req.query.type;
    const paymentId = String(dataId || req.body?.data?.id || '');
    const mpUserId = req.body?.user_id !== undefined ? String(req.body.user_id) : '';
    if (type !== 'payment' || !/^\d+$/.test(paymentId) || !mpUserId) {
      res.status(200).send('Ignorada');
      return;
    }

    const merchant = await store.findMerchantByMpUserId(mpUserId);
    if (!merchant?.mp || merchant.active === false) {
      res.status(200).send('Sin comercio');
      return;
    }

    try {
      const raw = await withToken(merchant, (token) => mp.getPayment(token, paymentId));
      if (canIngest(merchant, raw)) await ingest(merchant, raw, 'webhook');
      res.status(200).send('OK');
    } catch (err) {
      if (err instanceof MpError && err.status === 404) {
        res.status(200).send('Pago inexistente'); // e.g. the panel's test notification
        return;
      }
      // Not confirming makes Mercado Pago send it again later.
      console.error('[webhook] Error temporal:', (err as Error).message);
      res.status(500).send('Reintentar');
    }
  }));

  app.get('/api/webhooks/mercadopago', (_req, res) => {
    res.status(200).send('OK');
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Ruta inexistente.' });
  });

  app.use('/api', (err: Error, _req: Request, res: Response, next: NextFunction) => {
    console.error('[api] Error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Error interno. Probá de nuevo.' });
  });

  return app;
}

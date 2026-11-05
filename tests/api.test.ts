import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { FileStore } from '../server/store.js';
import { MockMp } from './mock-mp.js';

const WEBHOOK_SECRET = 'whsec-test';
const mock = new MockMp();
let server: Server;
let base = '';
let store: FileStore;
let dataDir = '';

/** Minimal browser: remembers cookies. */
class Client {
  cookies = new Map<string, string>();
  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(url.startsWith('http') ? url : base + url, {
      method,
      redirect: 'manual',
      headers: {
        'X-Requested-With': 'corroborador',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      const value = pair.slice(index + 1);
      if (value) this.cookies.set(pair.slice(0, index), value);
      else this.cookies.delete(pair.slice(0, index));
    }
    const type = res.headers.get('content-type') || '';
    return { status: res.status, location: res.headers.get('location'), data: type.includes('json') ? await res.json() : await res.text() };
  }
  get = (url: string) => this.req('GET', url);
  post = (url: string, body: unknown = {}) => this.req('POST', url, body);
}

let counter = 0;
async function newOwner() {
  const client = new Client();
  const email = `dueno${++counter}@x.com`;
  const res = await client.post('/api/auth/register', {
    businessName: `Comercio ${counter}`,
    email,
    password: 'clave-segura',
    registrationCode: 'ACTIVAR',
  });
  assert.equal(res.status, 201);
  return { client, email };
}

/** Full OAuth round trip through the fake Mercado Pago. */
async function connect(client: Client, seller: string) {
  process.env.MOCK_SELLER = seller;
  const start = await client.post('/api/auth/mercadopago/start');
  assert.equal(start.status, 200);
  const auth = await client.get(start.data.authUrl);
  return client.get(auth.location!);
}

function signedHeaders(dataId: string, secret = WEBHOOK_SECRET) {
  const ts = String(Date.now());
  const requestId = crypto.randomUUID();
  const v1 = crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
}

function webhook(paymentId: string, userId: string, headers: Record<string, string> = signedHeaders(paymentId)) {
  return new Client().req(
    'POST',
    `/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`,
    { type: 'payment', user_id: userId, action: 'payment.created', data: { id: paymentId } },
    headers,
  );
}

const paymentsOf = async (client: Client) => (await client.get('/api/payments')).data.payments as any[];
const uniqueSeller = () => `${100000 + ++counter}`;

before(async () => {
  await mock.start();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-test-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    DATA_DIR: dataDir,
    APP_URL: 'http://placeholder.test',
    APP_SECRET: 'x'.repeat(40),
    MERCADOPAGO_CLIENT_ID: 'app-1',
    MERCADOPAGO_CLIENT_SECRET: 'secret-1',
    MERCADOPAGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
    REGISTRATION_CODE: 'ACTIVAR',
    MP_API_BASE: mock.base,
    MP_AUTH_BASE: mock.base,
    MP_SYNC_INTERVAL_MS: '1',
    MP_REFRESH_SETTLE_MS: '1',
    ALLOW_SIMULATION: 'false',
  } as NodeJS.ProcessEnv);
  store = new FileStore(dataDir);
  const app = createApp(config, store);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  config.appUrl = base;
});

after(() => {
  server.closeAllConnections();
  server.close();
  mock.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  mock.payments.clear();
  mock.rejectRefresh = false;
  mock.down = false;
});

describe('accounts', () => {
  it('blocks API without session and registration without the code', async () => {
    assert.equal((await new Client().get('/api/payments')).status, 401);
    assert.equal((await new Client().post('/api/auth/mercadopago/unlink')).status, 401);
    const res = await new Client().post('/api/auth/register', {
      businessName: 'X',
      email: 'sin@codigo.com',
      password: 'clave-segura',
      registrationCode: 'MAL',
    });
    assert.equal(res.status, 403);
  });

  it('rejects wrong passwords and duplicate emails', async () => {
    const { email } = await newOwner();
    assert.equal((await new Client().post('/api/auth/login', { email, password: 'incorrecta' })).status, 401);
    assert.equal((await new Client().post('/api/auth/login', { email: email.toUpperCase(), password: 'clave-segura' })).status, 200);
    const dup = await new Client().post('/api/auth/register', {
      businessName: 'Y',
      email,
      password: 'clave-segura',
      registrationCode: 'ACTIVAR',
    });
    assert.equal(dup.status, 409);
  });

  it('refuses write requests without the app header (CSRF)', async () => {
    const { client } = await newOwner();
    const res = await client.req('POST', '/api/auth/mercadopago/unlink', {}, { 'X-Requested-With': '' });
    assert.equal(res.status, 403);
  });

  it('blocks a suspended merchant', async () => {
    const { client, email } = await newOwner();
    const merchant = await store.findMerchantByEmail(email);
    await store.updateMerchant(merchant!.id, { active: false });
    assert.equal((await client.get('/api/payments')).status, 401);
    assert.equal((await new Client().post('/api/auth/login', { email, password: 'clave-segura' })).status, 403);
  });
});

describe('connecting Mercado Pago', () => {
  it('completes OAuth and never stores tokens in clear text', async () => {
    const { client, email } = await newOwner();
    const seller = uniqueSeller();
    const done = await connect(client, seller);
    assert.equal(done.location, '/?mp_linked=true');
    const status = (await client.get('/api/status')).data;
    assert.equal(status.configured, true);
    assert.equal(status.linkedAccount.nickname, `TIENDA-${seller}`);
    assert.equal(JSON.stringify(status).includes('APP_USR'), false);
    const stored = fs.readFileSync(path.join(dataDir, 'dev-db.json'), 'utf8');
    assert.equal(stored.includes('APP_USR-'), false);
    assert.equal(stored.includes('TG-refresh'), false);
    assert.ok((await store.findMerchantByEmail(email))!.mp!.refreshTokenEnc.startsWith('v1.'));
  });

  it('rejects a forged callback', async () => {
    const { client } = await newOwner();
    const noState = await client.get('/api/auth/mercadopago/callback?code=abc');
    assert.equal(noState.location, '/?mp_error=invalid_state');

    // Authorization started by merchant A, finished by merchant B (link-injection attack).
    const a = await newOwner();
    const b = await newOwner();
    process.env.MOCK_SELLER = uniqueSeller();
    const start = await a.client.post('/api/auth/mercadopago/start');
    const auth = await a.client.get(start.data.authUrl);
    const stolen = await b.client.get(auth.location!);
    assert.equal(stolen.location, '/?mp_error=invalid_state');
    assert.equal((await b.client.get('/api/status')).data.configured, false);
  });

  it('shows a cancelled authorization as an error, not as connected', async () => {
    const { client } = await newOwner();
    const res = await client.get('/api/auth/mercadopago/callback?error=access_denied');
    assert.equal(res.location, '/?mp_error=cancelled');
    assert.equal((await client.get('/api/status')).data.configured, false);
  });

  it('does not let two merchants share one Mercado Pago account', async () => {
    const seller = uniqueSeller();
    assert.equal((await connect((await newOwner()).client, seller)).location, '/?mp_linked=true');
    const second = await newOwner();
    assert.equal((await connect(second.client, seller)).location, '/?mp_error=already_linked');
    assert.equal((await second.client.get('/api/status')).data.configured, false);
  });

  it('does not report connected if the exchange fails', async () => {
    const { client } = await newOwner();
    mock.down = true;
    process.env.MOCK_SELLER = uniqueSeller();
    const start = await client.post('/api/auth/mercadopago/start');
    const auth = await client.get(start.data.authUrl);
    mock.codes.clear();
    const done = await client.get(auth.location!);
    assert.equal(done.location, '/?mp_error=exchange_failed');
    assert.equal((await client.get('/api/status')).data.configured, false);
  });
});

describe('payments are never invented', () => {
  it('rejects unsigned and badly signed webhooks', async () => {
    const seller = uniqueSeller();
    const { client } = await newOwner();
    await connect(client, seller);
    mock.addPayment('5001', seller);
    assert.equal((await webhook('5001', seller, {})).status, 401);
    assert.equal((await webhook('5001', seller, signedHeaders('5001', 'otro-secreto'))).status, 401);
    const sig = signedHeaders('9999');
    assert.equal((await webhook('5001', seller, sig)).status, 401, 'signature for another payment');
    assert.equal((await store.listPayments((await store.findMerchantByMpUserId(seller))!.id, 10)).length, 0);
  });

  it('a valid notification for a payment that does not exist creates nothing', async () => {
    const seller = uniqueSeller();
    const { client } = await newOwner();
    await connect(client, seller);
    assert.equal((await webhook('424242', seller)).status, 200);
    assert.equal((await paymentsOf(client)).length, 0);
  });

  it('uses the amount from Mercado Pago, not from the notification', async () => {
    const seller = uniqueSeller();
    const { client, email } = await newOwner();
    await connect(client, seller);
    mock.addPayment('5002', seller, { transaction_amount: 777 });
    const headers = signedHeaders('5002');
    await new Client().req(
      'POST',
      '/api/webhooks/mercadopago?data.id=5002&type=payment',
      { type: 'payment', user_id: seller, data: { id: '5002' }, transaction_amount: 9999999 },
      headers,
    );
    const merchant = await store.findMerchantByEmail(email);
    const [payment] = await store.listPayments(merchant!.id, 10);
    assert.equal(payment.transactionAmount, 777);
    assert.equal(payment.source, 'webhook');
  });

  it('asks Mercado Pago to retry when the lookup fails temporarily, storing nothing', async () => {
    const seller = uniqueSeller();
    const { email, client } = await newOwner();
    await connect(client, seller);
    mock.addPayment('5003', seller);
    mock.down = true;
    assert.equal((await webhook('5003', seller)).status, 500);
    const merchant = await store.findMerchantByEmail(email);
    assert.equal((await store.listPayments(merchant!.id, 10)).length, 0);
    assert.equal((await client.get('/api/status')).data.configured, true, 'a short outage must not disconnect');
  });

  it('ignores payments collected by someone else and test-mode payments', async () => {
    const seller = uniqueSeller();
    const { client } = await newOwner();
    await connect(client, seller);
    mock.addPayment('6001', 'otra-persona');
    mock.addPayment('6002', seller, { live_mode: false });
    mock.addPayment('6003', seller);
    const { collector_id: _, ...withoutCollector } = mock.addPayment('6004', seller);
    mock.payments.set('6004', withoutCollector);
    assert.deepEqual((await paymentsOf(client)).map((p) => p.id), ['6003']);
  });

  it('simulation is off when configured off', async () => {
    const { client } = await newOwner();
    assert.equal((await client.post('/api/payments/simulate')).status, 404);
  });
});

describe('merchants are isolated', () => {
  it("one merchant can't see or decide another's payments", async () => {
    const sellerA = uniqueSeller();
    const sellerB = uniqueSeller();
    const a = await newOwner();
    const b = await newOwner();
    await connect(a.client, sellerA);
    await connect(b.client, sellerB);
    mock.addPayment('7001', sellerA);
    mock.addPayment('7002', sellerB);
    assert.deepEqual((await paymentsOf(a.client)).map((p) => p.id), ['7001']);
    assert.deepEqual((await paymentsOf(b.client)).map((p) => p.id), ['7002']);
    assert.equal((await b.client.post('/api/payments/7001/verify-sale', { status: 'accepted' })).status, 404);
    assert.equal((await paymentsOf(a.client))[0].saleVerification.status, 'pending');
  });

  it('a webhook goes to the right merchant only', async () => {
    const sellerA = uniqueSeller();
    const sellerB = uniqueSeller();
    const a = await newOwner();
    const b = await newOwner();
    await connect(a.client, sellerA);
    await connect(b.client, sellerB);
    mock.addPayment('7101', sellerA);
    // Notification claiming the payment belongs to merchant B: collector check stops it.
    assert.equal((await webhook('7101', sellerB)).status, 200);
    const merchantB = await store.findMerchantByMpUserId(sellerB);
    assert.equal((await store.listPayments(merchantB!.id, 10)).length, 0);
  });
});

describe('sales', () => {
  async function ownerWithPayment(extra: Record<string, unknown> = {}) {
    const seller = uniqueSeller();
    const owner = await newOwner();
    await connect(owner.client, seller);
    const id = String(800000 + ++counter);
    mock.addPayment(id, seller, extra);
    await paymentsOf(owner.client);
    return { ...owner, seller, id };
  }

  it('cannot accept a payment Mercado Pago has not approved', async () => {
    const { client, id } = await ownerWithPayment({ status: 'in_process', date_approved: null });
    assert.equal((await client.post(`/api/payments/${id}/verify-sale`, { status: 'accepted' })).status, 409);
  });

  it('only the first of two cashiers wins, and the name comes from the session', async () => {
    const { client, id } = await ownerWithPayment();
    const invite = (await client.get('/api/team/invite')).data;
    const lucas = new Client();
    assert.equal((await lucas.post('/api/auth/seller-login', { name: 'Lucas', code: invite.code })).status, 200);

    const first = await lucas.post(`/api/payments/${id}/verify-sale`, { status: 'accepted', acceptedBy: 'Otro nombre' });
    assert.equal(first.status, 200);
    assert.equal(first.data.payment.saleVerification.acceptedBy, 'Lucas');
    const second = await client.post(`/api/payments/${id}/verify-sale`, { status: 'accepted' });
    assert.equal(second.status, 409);
    assert.match(second.data.error, /Lucas/);
  });

  it('an update from Mercado Pago keeps the decision and reflects a refund', async () => {
    const { client, id, seller } = await ownerWithPayment();
    await client.post(`/api/payments/${id}/verify-sale`, { status: 'accepted' });
    mock.addPayment(id, seller, { status: 'refunded', date_last_updated: new Date(Date.now() + 1000).toISOString() });
    assert.equal((await webhook(id, seller)).status, 200);
    const [payment] = await paymentsOf(client);
    assert.equal(payment.status, 'refunded');
    assert.equal(payment.saleVerification.status, 'accepted');
  });
});

describe('sellers', () => {
  it('can work but cannot manage the account', async () => {
    const seller = uniqueSeller();
    const { client } = await newOwner();
    await connect(client, seller);
    const invite = (await client.get('/api/team/invite')).data;
    assert.equal((await new Client().post('/api/auth/seller-login', { name: 'X', code: 'invalido' })).status, 401);

    const cashier = new Client();
    await cashier.post('/api/auth/seller-login', { name: 'Caja 1', code: invite.code });
    assert.equal((await cashier.get('/api/payments')).status, 200);
    assert.equal((await cashier.post('/api/auth/mercadopago/unlink')).status, 403);
    assert.equal((await cashier.post('/api/auth/mercadopago/start')).status, 403);
    assert.equal((await cashier.get('/api/team/invite')).status, 403);
    assert.equal((await client.get('/api/status')).data.configured, true);
    assert.equal((await cashier.get('/api/status')).data.linkedAccount.email, '');
  });

  it('changing the link removes every seller', async () => {
    const { client } = await newOwner();
    const invite = (await client.get('/api/team/invite')).data;
    const cashier = new Client();
    await cashier.post('/api/auth/seller-login', { name: 'Caja 1', code: invite.code });
    assert.equal((await cashier.get('/api/payments')).status, 200);
    const fresh = (await client.post('/api/team/invite/rotate')).data;
    assert.notEqual(fresh.code, invite.code);
    assert.equal((await cashier.get('/api/payments')).status, 401);
    assert.equal((await new Client().post('/api/auth/seller-login', { name: 'Y', code: invite.code })).status, 401);
    assert.equal((await new Client().post('/api/auth/seller-login', { name: 'Y', code: fresh.code })).status, 200);
    assert.equal((await client.get('/api/payments')).status, 200, 'the owner stays in');
  });
});

describe('token renewal', () => {
  async function connected() {
    const seller = uniqueSeller();
    const owner = await newOwner();
    await connect(owner.client, seller);
    return { ...owner, seller, merchant: (await store.findMerchantByEmail(owner.email))! };
  }

  it('renews a token close to expiring and keeps working', async () => {
    const { client, seller, merchant } = await connected();
    await store.updateMerchant(merchant.id, {
      mp: { ...merchant.mp!, expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
    mock.addPayment('9001', seller);
    const before = mock.refreshCount;
    assert.equal((await paymentsOf(client)).length, 1);
    assert.equal(mock.refreshCount, before + 1);
    const updated = (await store.getMerchant(merchant.id))!;
    assert.ok(new Date(updated.mp!.expiresAt).getTime() > Date.now() + 100 * 86_400_000);
    assert.notEqual(updated.mp!.refreshTokenEnc, merchant.mp!.refreshTokenEnc);
  });

  it('recovers when Mercado Pago rejects the current token', async () => {
    const { client, seller } = await connected();
    for (const [token, owner] of mock.tokens) if (owner === seller) mock.tokens.delete(token);
    mock.addPayment('9002', seller);
    assert.equal((await paymentsOf(client)).length, 1);
  });

  it('asks to reconnect only when renewal is refused, and says so', async () => {
    const { client, seller } = await connected();
    for (const [token, owner] of mock.tokens) if (owner === seller) mock.tokens.delete(token);
    mock.rejectRefresh = true;
    const res = await client.get('/api/payments');
    assert.equal(res.status, 200);
    assert.equal(res.data.status.needsReauth, true);
    assert.equal(res.data.status.configured, false);
    assert.equal((await client.post('/api/mercadopago/sync')).status, 409);
  });

  it('survives a server restart', async () => {
    const { client, merchant, seller } = await connected();
    mock.addPayment('9003', seller);
    await paymentsOf(client);
    const reloaded = new FileStore(dataDir);
    assert.equal((await reloaded.getMerchant(merchant.id))!.mp!.state, 'active');
    assert.equal((await reloaded.listPayments(merchant.id, 10)).length, 1);
  });
});

describe('polling', () => {
  it('finds a payment with no webhook, and a later change', async () => {
    const seller = uniqueSeller();
    const { client } = await newOwner();
    await connect(client, seller);
    mock.addPayment('9101', seller, { status: 'in_process', date_approved: null, date_last_updated: '2026-01-01' });
    assert.equal((await paymentsOf(client))[0].status, 'in_process');
    mock.addPayment('9101', seller, { date_last_updated: '2026-01-02' });
    assert.equal((await paymentsOf(client))[0].status, 'approved');
  });

  it('skips the heavy read when nothing changed', async () => {
    const seller = uniqueSeller();
    const { client } = await newOwner();
    await connect(client, seller);
    mock.addPayment('9201', seller);
    const first = (await client.get('/api/payments')).data;
    assert.equal(first.payments.length, 1);
    const second = (await client.get(`/api/payments?since=${first.status.revision}`)).data;
    assert.equal(second.unchanged, true);
    assert.equal(second.payments, undefined);
  });

  it('does not import old payments on connecting', async () => {
    const seller = uniqueSeller();
    const { client } = await newOwner();
    await connect(client, seller);
    mock.addPayment('9301', seller, { date_created: new Date(Date.now() - 2 * 86_400_000).toISOString() });
    mock.addPayment('9302', seller);
    assert.deepEqual((await paymentsOf(client)).map((p) => p.id), ['9302']);
  });
});

describe('review regressions', () => {
  const connected = async () => {
    const seller = uniqueSeller();
    const owner = await newOwner();
    await connect(owner.client, seller);
    return { ...owner, seller, merchant: (await store.findMerchantByEmail(owner.email))! };
  };
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  it('a late webhook for an old payment does not create a payment to approve', async () => {
    const { client, seller } = await connected();
    mock.addPayment('10001', seller, { date_created: ago(90) });
    assert.equal((await webhook('10001', seller)).status, 200);
    assert.deepEqual(await paymentsOf(client), []);
  });

  it('older data never undoes a newer status', async () => {
    const { client, seller } = await connected();
    mock.addPayment('10002', seller, { status: 'refunded', date_last_updated: ago(0) });
    await webhook('10002', seller);
    mock.addPayment('10002', seller, { status: 'approved', date_last_updated: ago(1) });
    await webhook('10002', seller);
    assert.equal((await paymentsOf(client))[0].status, 'refunded');
  });

  it('a refund seconds before accepting is caught at the last moment', async () => {
    const { client, seller } = await connected();
    mock.addPayment('10003', seller);
    await paymentsOf(client);
    mock.addPayment('10003', seller, { status: 'refunded', date_last_updated: new Date(Date.now() + 5000).toISOString() });
    const res = await client.post('/api/payments/10003/verify-sale', { status: 'accepted' });
    assert.equal(res.status, 409);
    assert.equal(res.data.payment.status, 'refunded');
  });

  it('a Mercado Pago outage does not block accepting a confirmed payment', async () => {
    const { client, seller } = await connected();
    mock.addPayment('10004', seller);
    await paymentsOf(client);
    mock.down = true;
    assert.equal((await client.post('/api/payments/10004/verify-sale', { status: 'accepted' })).status, 200);
  });

  it('a stale instance cannot overwrite tokens saved by another one', async () => {
    const { merchant } = await connected();
    const stale = { ...merchant.mp!, state: 'needs_reauth' as const };
    await store.updateMerchant(merchant.id, { mp: { ...merchant.mp!, refreshTokenEnc: 'nuevo' } });
    assert.equal(await store.updateMpIfUnchanged(merchant.id, merchant.mp!.refreshTokenEnc, stale), false);
    assert.equal((await store.getMerchant(merchant.id))!.mp!.state, 'active');
    await store.updateMerchant(merchant.id, { mp: null });
    assert.equal(await store.updateMpIfUnchanged(merchant.id, 'nuevo', stale), false, 'no reconnect after unlink');
    assert.equal((await store.getMerchant(merchant.id))!.mp, null);
  });

  it('an unrelated renewal error does not disconnect a healthy merchant', async () => {
    const { client, seller, merchant } = await connected();
    await store.updateMerchant(merchant.id, {
      mp: { ...merchant.mp!, expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
    mock.refreshStatus = 403;
    mock.addPayment('10005', seller);
    try {
      const res = await client.get('/api/payments');
      assert.equal(res.data.status.configured, true);
      assert.equal(res.data.payments.length, 1);
    } finally {
      mock.refreshStatus = 0;
    }
  });

  it('payments keep arriving after a refused renewal while the token still works', async () => {
    const { client, seller, merchant } = await connected();
    await store.updateMerchant(merchant.id, { mp: { ...merchant.mp!, state: 'needs_reauth' } });
    mock.addPayment('10006', seller);
    const res = await client.get('/api/payments');
    assert.equal(res.data.status.needsReauth, true);
    assert.equal(res.data.payments.length, 1);
  });

  it("payments from a disconnected account can't be accepted", async () => {
    const { client, seller } = await connected();
    mock.addPayment('10007', seller);
    await paymentsOf(client);
    await client.post('/api/auth/mercadopago/unlink');
    assert.equal((await paymentsOf(client))[0].status, 'other_account');
    assert.equal((await client.post('/api/payments/10007/verify-sale', { status: 'accepted' })).status, 409);
    assert.equal((await client.post('/api/payments/10007/verify-sale', { status: 'rejected' })).status, 200);
  });

  it('a missing live_mode does not hide a real payment', async () => {
    const { client, seller } = await connected();
    const { live_mode: _, ...raw } = mock.addPayment('10008', seller);
    mock.payments.set('10008', raw);
    assert.deepEqual((await paymentsOf(client)).map((p) => p.id), ['10008']);
  });

  it("a bank transfer never shows the shop's own data as the customer", async () => {
    const { client, seller } = await connected();
    const shop = { id: seller, email: 'tienda@mail.com', identification: { type: 'CUIT', number: '20111' } };
    mock.addPayment('10009', seller, { operation_type: 'account_fund', payer: shop });
    mock.addPayment('10010', seller, { operation_type: 'money_transfer', payer: { ...shop, id: 'otro', email: 'cliente@mail.com' } });
    const byId = Object.fromEntries((await paymentsOf(client)).map((p) => [p.id, p]));
    assert.equal(byId['10009'].payer.fullName, 'Titular no informado');
    assert.equal(byId['10009'].payer.email, '');
    assert.equal(byId['10009'].payer.identificationNumber, undefined);
    assert.equal(byId['10010'].payer.fullName, 'cliente@mail.com');
    assert.equal(byId['10010'].payer.identificationNumber, '20111');
  });

  it('after disconnecting, the same account can connect to another merchant', async () => {
    const { client, seller } = await connected();
    await client.post('/api/auth/mercadopago/unlink');
    assert.equal((await connect((await newOwner()).client, seller)).location, '/?mp_linked=true');
  });
});

describe('brute force', () => {
  it('stops guessing passwords, without counting successful logins', async () => {
    const { email } = await newOwner();
    for (let i = 0; i < 15; i++) {
      assert.equal((await new Client().post('/api/auth/login', { email, password: 'clave-segura' })).status, 200);
    }
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await new Client().post('/api/auth/login', { email, password: 'mala' })).status;
    }
    assert.equal(last, 429);
  });
});

describe('configuration', () => {
  it('takes the public URL from Vercel when APP_URL is not set', () => {
    const env = { NODE_ENV: 'production', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'pagos.vercel.app', DATA_DIR: dataDir };
    const config = loadConfig({ ...env, APP_URL: 'MY_APP_URL' } as NodeJS.ProcessEnv);
    assert.equal(config.appUrl, 'https://pagos.vercel.app');
    assert.equal(config.missing.includes('APP_URL'), false);
  });

  it('lists what is missing in production and blocks the API', async () => {
    const config = loadConfig({ NODE_ENV: 'production', DATA_DIR: dataDir } as NodeJS.ProcessEnv);
    assert.ok(config.missing.includes('FIREBASE_SERVICE_ACCOUNT'));
    assert.ok(config.missing.includes('APP_SECRET'));
    assert.equal(config.allowSimulation, false);
    const app = createApp(config, new FileStore(path.join(dataDir, 'unused')));
    const instance = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const url = `http://127.0.0.1:${(instance.address() as AddressInfo).port}`;
    const session = await (await fetch(`${url}/api/session`)).json();
    assert.ok(session.setupMissing.length >= 6);
    assert.equal((await fetch(`${url}/api/payments`)).status, 503);
    assert.equal((await fetch(`${url}/api/webhooks/mercadopago`, { method: 'POST' })).status, 503);
    instance.closeAllConnections();
    instance.close();
  });
});

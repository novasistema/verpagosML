/**
 * Runs the Firestore adapter's logic against an in-memory imitation of the SDK.
 * It checks our code paths, not Firestore itself.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EmailTakenError, FirestoreStore, parseServiceAccount } from '../server/store.js';
import type { Merchant, MpPaymentFields } from '../server/types.js';

const INC = Symbol('inc');

class FakeDoc {
  constructor(
    readonly db: FakeDb,
    readonly path: string,
  ) {}
  get id() {
    return this.path.split('/').pop()!;
  }
  collection(name: string) {
    return new FakeCollection(this.db, `${this.path}/${name}`);
  }
  async get() {
    return this.db.snap(this.path);
  }
  async delete() {
    this.db.data.delete(this.path);
  }
  async update(patch: any) {
    this.db.applyUpdate(this.path, patch);
  }
}

class FakeCollection {
  private filter?: [string, unknown];
  private order?: string;
  private max = Infinity;
  constructor(
    readonly db: FakeDb,
    readonly path: string,
  ) {}
  doc(id: string) {
    return new FakeDoc(this.db, `${this.path}/${id}`);
  }
  where(field: string, _op: string, value: unknown) {
    this.filter = [field, value];
    return this;
  }
  orderBy(field: string) {
    this.order = field;
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  async get() {
    let docs = [...this.db.data.entries()]
      .filter(([p]) => p.startsWith(`${this.path}/`) && !p.slice(this.path.length + 1).includes('/'))
      .map(([p]) => this.db.snap(p));
    if (this.filter) docs = docs.filter((d) => d.data()![this.filter![0]] === this.filter![1]);
    if (this.order) docs.sort((a, b) => String(b.data()![this.order!]).localeCompare(String(a.data()![this.order!])));
    docs = docs.slice(0, this.max);
    return { empty: docs.length === 0, docs };
  }
}

class FakeDb {
  data = new Map<string, any>();
  snap(path: string) {
    const value = this.data.get(path);
    return { exists: value !== undefined, data: () => (value === undefined ? undefined : structuredClone(value)) };
  }
  applyUpdate(path: string, patch: any) {
    const next = { ...this.data.get(path) };
    if (!this.data.has(path)) throw new Error('NOT_FOUND');
    for (const [key, value] of Object.entries(patch)) {
      next[key] = (value as any)?.[INC] ? (next[key] || 0) + (value as any)[INC] : value;
    }
    this.data.set(path, next);
  }
  collection(name: string) {
    return new FakeCollection(this, name);
  }
  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const writes: (() => void)[] = [];
    const result = await fn({
      get: (ref: FakeDoc) => ref.get(),
      create: (ref: FakeDoc, value: any) =>
        writes.push(() => {
          if (this.data.has(ref.path)) throw new Error('ALREADY_EXISTS');
          this.data.set(ref.path, value);
        }),
      set: (ref: FakeDoc, value: any) => writes.push(() => this.data.set(ref.path, value)),
      update: (ref: FakeDoc, patch: any) => writes.push(() => this.applyUpdate(ref.path, patch)),
      delete: (ref: FakeDoc) => writes.push(() => this.data.delete(ref.path)),
    });
    writes.forEach((w) => w());
    return result;
  }
}

const merchant = (id: string, email: string): Merchant => ({
  id,
  businessName: id,
  ownerEmail: email,
  passwordHash: 'x',
  active: true,
  createdAt: '2026-01-01',
  ownerSessionVersion: 1,
  sellerSessionVersion: 1,
  sellerCodeHash: `hash-${id}`,
  sellerCodeEnc: 'x',
  mpUserId: null,
  mp: null,
  revision: 0,
});

const payment = (id: string, extra: Partial<MpPaymentFields> = {}): MpPaymentFields => ({
  id,
  dateCreated: `2026-01-0${id}T00:00:00Z`,
  dateApproved: null,
  status: 'approved',
  statusDetail: '',
  transactionAmount: 10,
  netReceivedAmount: 10,
  feeAmount: 0,
  currencyId: 'ARS',
  paymentMethodId: 'x',
  paymentTypeId: 'x',
  installments: 1,
  description: 'x',
  cardLastFourDigits: undefined, // Firestore refuses undefined values
  payer: { firstName: '', lastName: '', fullName: 'x', email: '', id: undefined },
  ...extra,
});

function setup() {
  const db = new FakeDb();
  const store = new FirestoreStore(db as any, ((n: number) => ({ [INC]: n })) as any);
  return { db, store };
}

describe('FirestoreStore', () => {
  it('keeps emails unique and finds merchants', async () => {
    const { store } = setup();
    await store.createMerchant(merchant('a', 'a@x.com'));
    await assert.rejects(store.createMerchant(merchant('b', 'a@x.com')), EmailTakenError);
    assert.equal((await store.findMerchantByEmail('a@x.com'))!.id, 'a');
    assert.equal(await store.findMerchantByEmail('z@x.com'), null);
    assert.equal((await store.findMerchantBySellerCodeHash('hash-a'))!.id, 'a');
    await store.updateMerchant('a', { mpUserId: '77' });
    assert.equal((await store.findMerchantByMpUserId('77'))!.id, 'a');
    assert.equal(await store.getMerchant('b'), null);
  });

  it('stores payments per merchant, keeps decisions, and bumps revision only on change', async () => {
    const { store, db } = setup();
    await store.createMerchant(merchant('a', 'a@x.com'));
    await store.createMerchant(merchant('b', 'b@x.com'));

    assert.equal((await store.upsertPayment('a', payment('1'), 'webhook'))!.created, true);
    assert.equal((await store.getMerchant('a'))!.revision, 1);
    assert.equal((await store.upsertPayment('a', payment('1'), 'api_sync'))!.changed, false);
    assert.equal((await store.getMerchant('a'))!.revision, 1);
    assert.equal(await store.listPayments('b', 10).then((l) => l.length), 0);

    const decided = await store.decideSale('a', '1', { status: 'accepted', acceptedBy: 'Lucas' });
    assert.equal(decided.outcome, 'ok');
    const again = await store.decideSale('a', '1', { status: 'rejected' });
    assert.equal(again.outcome, 'already_decided');
    assert.equal((await store.decideSale('b', '1', { status: 'accepted' })).outcome, 'not_found');

    const refunded = await store.upsertPayment('a', payment('1', { status: 'refunded' }), 'api_sync');
    assert.equal(refunded!.payment.saleVerification.acceptedBy, 'Lucas');
    assert.equal(refunded!.payment.source, 'webhook');

    await store.upsertPayment('a', payment('2', { status: 'in_process' }), 'api_sync');
    assert.equal((await store.decideSale('a', '2', { status: 'accepted' })).outcome, 'not_approved');
    assert.deepEqual((await store.listPayments('a', 1)).map((p) => p.id), ['2']);

    // Nothing undefined reaches the database.
    const raw = db.data.get('merchants/a/payments/1');
    assert.equal('cardLastFourDigits' in raw, false);
  });

  it('field order coming back from the database is not a change', async () => {
    const { store, db } = setup();
    await store.createMerchant(merchant('a', 'a@x.com'));
    await store.upsertPayment('a', payment('1'), 'webhook');
    const path = 'merchants/a/payments/1';
    const reverse = (o: any) => Object.fromEntries(Object.entries(o).reverse());
    const raw = db.data.get(path);
    db.data.set(path, reverse({ ...raw, payer: reverse(raw.payer) }));
    assert.equal((await store.upsertPayment('a', payment('1'), 'api_sync'))!.changed, false);
  });

  it('holds one Mercado Pago account per merchant and writes tokens conditionally', async () => {
    const { store } = setup();
    await store.createMerchant(merchant('a', 'a@x.com'));
    assert.equal(await store.claimMpUser('a', '9'), true);
    assert.equal(await store.claimMpUser('a', '9'), true);
    assert.equal(await store.claimMpUser('b', '9'), false);
    await store.releaseMpUser('b', '9');
    assert.equal(await store.claimMpUser('b', '9'), false, 'only the holder releases');
    await store.releaseMpUser('a', '9');
    assert.equal(await store.claimMpUser('b', '9'), true);

    const mp = { refreshTokenEnc: 'r1', state: 'active' } as any;
    await store.updateMerchant('a', { mp });
    assert.equal(await store.updateMpIfUnchanged('a', 'r0', { ...mp, refreshTokenEnc: 'x' }), false);
    assert.equal(await store.updateMpIfUnchanged('a', 'r1', { ...mp, refreshTokenEnc: 'r2' }), true);
    assert.equal((await store.getMerchant('a'))!.mp!.refreshTokenEnc, 'r2');
  });

  it('does not create records older than the limit, and ignores older data', async () => {
    const { store } = setup();
    await store.createMerchant(merchant('a', 'a@x.com'));
    assert.equal(await store.upsertPayment('a', payment('1'), 'webhook', Date.parse('2027-01-01')), null);
    await store.upsertPayment('a', payment('2', { dateLastUpdated: '2026-02-02T00:00:00Z', status: 'refunded' }), 'webhook');
    const old = await store.upsertPayment('a', payment('2', { dateLastUpdated: '2026-02-01T00:00:00Z' }), 'api_sync');
    assert.equal(old!.changed, false);
    assert.equal((await store.getPayment('a', '2'))!.status, 'refunded');
    assert.equal(await store.getPayment('a', '9'), null);
  });

  it('reads the service account as JSON or Base64', () => {
    const json = '{"project_id":"p"}';
    assert.equal(parseServiceAccount(json).project_id, 'p');
    assert.equal(parseServiceAccount(Buffer.from(json).toString('base64')).project_id, 'p');
  });
});

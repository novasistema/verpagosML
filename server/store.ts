import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { AppConfig } from './config';
import type { Merchant, MpPaymentFields, PaymentRecord, SaleVerificationData } from './types';

export class EmailTakenError extends Error {}

export type DecideResult =
  | { outcome: 'ok'; payment: PaymentRecord }
  | { outcome: 'not_found' }
  | { outcome: 'not_approved'; payment: PaymentRecord }
  | { outcome: 'already_decided'; payment: PaymentRecord };

export interface UpsertResult {
  payment: PaymentRecord;
  created: boolean;
  changed: boolean;
}

export interface Store {
  readonly kind: 'firestore' | 'file';
  createMerchant(merchant: Merchant): Promise<void>;
  getMerchant(id: string): Promise<Merchant | null>;
  findMerchantByEmail(email: string): Promise<Merchant | null>;
  findMerchantByMpUserId(mpUserId: string): Promise<Merchant | null>;
  findMerchantBySellerCodeHash(hash: string): Promise<Merchant | null>;
  updateMerchant(id: string, patch: Partial<Merchant>): Promise<void>;
  listPayments(merchantId: string, limit: number): Promise<PaymentRecord[]>;
  /** Saves Mercado Pago's data for a payment, keeping the merchant's sale decision untouched. */
  upsertPayment(merchantId: string, fields: MpPaymentFields, source: PaymentRecord['source']): Promise<UpsertResult>;
  /** Atomic: when two cashiers answer at once, only the first decision is kept. */
  decideSale(merchantId: string, paymentId: string, decision: SaleVerificationData): Promise<DecideResult>;
}

const newest = (a: PaymentRecord, b: PaymentRecord) =>
  new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime();

function applyDecision(current: PaymentRecord | null, decision: SaleVerificationData): DecideResult {
  if (!current) return { outcome: 'not_found' };
  if (current.saleVerification.status !== 'pending') return { outcome: 'already_decided', payment: current };
  if (decision.status === 'accepted' && current.status !== 'approved') {
    return { outcome: 'not_approved', payment: current };
  }
  return { outcome: 'ok', payment: { ...current, saleVerification: decision } };
}

function mergePayment(
  current: PaymentRecord | null,
  fields: MpPaymentFields,
  source: PaymentRecord['source'],
): UpsertResult {
  if (!current) {
    return { payment: { ...fields, saleVerification: { status: 'pending' }, source }, created: true, changed: true };
  }
  const payment: PaymentRecord = { ...current, ...fields };
  return { payment, created: false, changed: JSON.stringify(current) !== JSON.stringify(payment) };
}

/** Removes undefined values so both backends store exactly the same data. */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---------------------------------------------------------------------------
// Development only: one JSON file. Never used in production.
// ---------------------------------------------------------------------------
interface FileData {
  merchants: Record<string, Merchant>;
  payments: Record<string, Record<string, PaymentRecord>>;
}

export class FileStore implements Store {
  readonly kind = 'file' as const;
  private readonly file: string;
  private data: FileData = { merchants: {}, payments: {} };

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'dev-db.json');
    if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
  }

  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 });
  }

  private find(test: (m: Merchant) => boolean): Merchant | null {
    const merchant = Object.values(this.data.merchants).find(test);
    return merchant ? clean(merchant) : null;
  }

  async createMerchant(merchant: Merchant) {
    if (this.find((m) => m.ownerEmail === merchant.ownerEmail)) throw new EmailTakenError();
    this.data.merchants[merchant.id] = clean(merchant);
    this.save();
  }
  async getMerchant(id: string) {
    return this.find((m) => m.id === id);
  }
  async findMerchantByEmail(email: string) {
    return this.find((m) => m.ownerEmail === email);
  }
  async findMerchantByMpUserId(mpUserId: string) {
    return this.find((m) => m.mpUserId === mpUserId);
  }
  async findMerchantBySellerCodeHash(hash: string) {
    return this.find((m) => m.sellerCodeHash === hash);
  }
  async updateMerchant(id: string, patch: Partial<Merchant>) {
    const merchant = this.data.merchants[id];
    if (!merchant) return;
    this.data.merchants[id] = clean({ ...merchant, ...patch });
    this.save();
  }
  async listPayments(merchantId: string, limit: number) {
    return clean(Object.values(this.data.payments[merchantId] || {}).sort(newest).slice(0, limit));
  }
  async upsertPayment(merchantId: string, fields: MpPaymentFields, source: PaymentRecord['source']) {
    const bucket = (this.data.payments[merchantId] ||= {});
    const result = mergePayment(bucket[fields.id] || null, clean(fields), source);
    if (result.changed) {
      bucket[fields.id] = clean(result.payment);
      this.data.merchants[merchantId].revision += 1;
      this.save();
    }
    return clean(result);
  }
  async decideSale(merchantId: string, paymentId: string, decision: SaleVerificationData) {
    const bucket = this.data.payments[merchantId] || {};
    const result = applyDecision(bucket[paymentId] || null, clean(decision));
    if (result.outcome === 'ok') {
      bucket[paymentId] = clean(result.payment);
      this.data.merchants[merchantId].revision += 1;
      this.save();
    }
    return clean(result);
  }
}

// ---------------------------------------------------------------------------
// Production: Firestore
//   merchants/{id}
//   merchants/{id}/payments/{mercadoPagoPaymentId}
//   ownerEmails/{sha256(email)}   keeps emails unique
// ---------------------------------------------------------------------------
export class FirestoreStore implements Store {
  readonly kind = 'firestore' as const;

  // `db` and `increment` are passed in so firebase-admin only loads where it is used.
  constructor(
    private readonly db: FirebaseFirestore.Firestore,
    private readonly increment: (n: number) => FirebaseFirestore.FieldValue,
  ) {}

  private merchants() {
    return this.db.collection('merchants');
  }
  private emailDoc(email: string) {
    return this.db.collection('ownerEmails').doc(crypto.createHash('sha256').update(email).digest('hex'));
  }
  private payment(merchantId: string, paymentId: string) {
    return this.merchants().doc(merchantId).collection('payments').doc(paymentId);
  }
  private async first(field: string, value: string): Promise<Merchant | null> {
    const snap = await this.merchants().where(field, '==', value).limit(1).get();
    return snap.empty ? null : (snap.docs[0].data() as Merchant);
  }

  async createMerchant(merchant: Merchant) {
    const emailRef = this.emailDoc(merchant.ownerEmail);
    await this.db.runTransaction(async (tx) => {
      if ((await tx.get(emailRef)).exists) throw new EmailTakenError();
      tx.create(emailRef, { merchantId: merchant.id });
      tx.create(this.merchants().doc(merchant.id), clean(merchant));
    });
  }
  async getMerchant(id: string) {
    const snap = await this.merchants().doc(id).get();
    return snap.exists ? (snap.data() as Merchant) : null;
  }
  async findMerchantByEmail(email: string) {
    const snap = await this.emailDoc(email).get();
    return snap.exists ? this.getMerchant(snap.data()!.merchantId) : null;
  }
  findMerchantByMpUserId(mpUserId: string) {
    return this.first('mpUserId', mpUserId);
  }
  findMerchantBySellerCodeHash(hash: string) {
    return this.first('sellerCodeHash', hash);
  }
  async updateMerchant(id: string, patch: Partial<Merchant>) {
    await this.merchants().doc(id).update(clean(patch) as FirebaseFirestore.UpdateData<Merchant>);
  }
  async listPayments(merchantId: string, limit: number) {
    const snap = await this.merchants()
      .doc(merchantId)
      .collection('payments')
      .orderBy('dateCreated', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((doc) => doc.data() as PaymentRecord).sort(newest);
  }
  async upsertPayment(merchantId: string, fields: MpPaymentFields, source: PaymentRecord['source']) {
    const ref = this.payment(merchantId, fields.id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const result = mergePayment(snap.exists ? (snap.data() as PaymentRecord) : null, clean(fields), source);
      if (result.changed) {
        tx.set(ref, clean(result.payment));
        tx.update(this.merchants().doc(merchantId), { revision: this.increment(1) });
      }
      return result;
    });
  }
  async decideSale(merchantId: string, paymentId: string, decision: SaleVerificationData) {
    const ref = this.payment(merchantId, paymentId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const result = applyDecision(snap.exists ? (snap.data() as PaymentRecord) : null, clean(decision));
      if (result.outcome === 'ok') {
        tx.set(ref, clean(result.payment));
        tx.update(this.merchants().doc(merchantId), { revision: this.increment(1) });
      }
      return result;
    });
  }
}

/** Accepts the service account as JSON or Base64 (some panels break multi-line values). */
export function parseServiceAccount(raw: string): Record<string, string> {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(text);
}

export async function createStore(config: AppConfig): Promise<Store> {
  if (!config.firebaseServiceAccount) {
    if (config.production) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT');
    console.warn('[store] Modo desarrollo: datos en un archivo local. En producción se usa Firestore.');
    return new FileStore(config.dataDir);
  }
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ credential: cert(parseServiceAccount(config.firebaseServiceAccount)) });
  const db = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);
  return new FirestoreStore(db, (n) => FieldValue.increment(n));
}

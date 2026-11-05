import type { MpPaymentFields } from './types.js';

export const MP_SEARCH_PAGE = 50;

export class MpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
  /** Mercado Pago rejected the credentials, as opposed to a temporary failure. */
  get isAuth() {
    return this.status === 401 || this.status === 403;
  }
}

export interface MpTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number | string;
  live_mode?: boolean;
}

export interface MpProfile {
  id: number | string;
  nickname?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  country_id?: string;
  site_id?: string;
}

/** Raw Mercado Pago payment; only the fields this app reads. */
export interface MpRawPayment {
  id: number | string;
  operation_type?: string;
  collector_id?: number | string;
  collector?: { id?: number | string };
  live_mode?: boolean;
  date_created?: string;
  date_approved?: string | null;
  date_last_updated?: string;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  transaction_amount_refunded?: number;
  transaction_details?: { net_received_amount?: number };
  fee_details?: { amount?: number }[];
  currency_id?: string;
  payment_method_id?: string;
  payment_type_id?: string;
  installments?: number;
  description?: string;
  external_reference?: string;
  card?: { last_four_digits?: string };
  payer?: {
    id?: number | string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: { area_code?: string; number?: string };
    identification?: { type?: string; number?: string };
  };
  point_of_interaction?: {
    transaction_data?: { bank_info?: { payer?: { long_name?: string } } };
  };
}

export class MercadoPagoClient {
  constructor(
    private readonly opts: { apiBase: string; authBase: string; clientId: string; clientSecret: string },
  ) {}

  get oauthConfigured() {
    return Boolean(this.opts.clientId && this.opts.clientSecret);
  }

  authorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.opts.clientId,
      response_type: 'code',
      platform_id: 'mp',
      state,
      redirect_uri: redirectUri,
    });
    return `${this.opts.authBase}/authorization?${params}`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.opts.apiBase}${path}`, { ...init, signal: AbortSignal.timeout(8000) });
    } catch (err) {
      throw new MpError(0, `No se pudo contactar a Mercado Pago: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new MpError(res.status, `Mercado Pago respondió ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  private token(body: Record<string, string>) {
    return this.request<MpTokenResponse>('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
        ...body,
      }).toString(),
    });
  }

  exchangeCode(code: string, redirectUri: string) {
    return this.token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  }

  refresh(refreshToken: string) {
    return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  private authed<T>(path: string, accessToken: string) {
    return this.request<T>(path, { headers: { Authorization: `Bearer ${accessToken}` } });
  }

  getProfile(accessToken: string) {
    return this.authed<MpProfile>('/users/me', accessToken);
  }

  getPayment(accessToken: string, paymentId: string) {
    return this.authed<MpRawPayment>(`/v1/payments/${encodeURIComponent(paymentId)}`, accessToken);
  }

  /** Payments that changed recently, newest change first, so late approvals and refunds are seen. */
  async searchRecentPayments(accessToken: string, offset = 0): Promise<MpRawPayment[]> {
    const params = new URLSearchParams({
      sort: 'date_last_updated',
      criteria: 'desc',
      range: 'date_last_updated',
      begin_date: 'NOW-2DAYS',
      end_date: 'NOW',
      limit: String(MP_SEARCH_PAGE),
      offset: String(offset),
    });
    const data = await this.authed<{ results?: MpRawPayment[] }>(`/v1/payments/search?${params}`, accessToken);
    return data.results || [];
  }
}

/**
 * True only when the money was received by this merchant.
 * A missing collector counts as "not theirs": this app must never confirm what it can't prove.
 */
export function isCollectedBy(raw: MpRawPayment, mpUserId: string): boolean {
  const collector = raw.collector_id ?? raw.collector?.id;
  return collector !== undefined && collector !== null && String(collector) === mpUserId;
}

export function mapPayment(raw: MpRawPayment): MpPaymentFields {
  const collector = raw.collector_id ?? raw.collector?.id;
  // In bank transfers (account_fund) Mercado Pago may report the receiving account as the payer.
  // Showing the shop's own data as "the customer" would mislead the cashier.
  const payerIsUnknown =
    raw.operation_type === 'account_fund' ||
    (raw.payer?.id !== undefined && collector !== undefined && String(raw.payer.id) === String(collector));
  const payer = payerIsUnknown ? {} : raw.payer || {};
  const identification = payer.identification || {};
  const firstName = payer.first_name || '';
  const lastName = payer.last_name || '';
  const fullName =
    [firstName, lastName].filter(Boolean).join(' ') ||
    raw.point_of_interaction?.transaction_data?.bank_info?.payer?.long_name ||
    payer.email ||
    'Titular no informado';
  const amount = raw.transaction_amount || 0;
  const fees = (raw.fee_details || []).reduce((sum, fee) => sum + (fee.amount || 0), 0);

  return {
    id: String(raw.id),
    dateCreated: raw.date_created || new Date().toISOString(),
    dateApproved: raw.date_approved || null,
    dateLastUpdated: raw.date_last_updated,
    collectorId: String(collector ?? ''),
    operationType: raw.operation_type,
    transactionAmountRefunded: raw.transaction_amount_refunded || undefined,
    status: raw.status || 'pending',
    statusDetail: raw.status_detail || '',
    transactionAmount: amount,
    netReceivedAmount: raw.transaction_details?.net_received_amount ?? amount - fees,
    feeAmount: fees,
    currencyId: raw.currency_id || 'ARS',
    paymentMethodId: raw.payment_method_id || 'other',
    paymentTypeId: raw.payment_type_id || 'other',
    installments: raw.installments || 1,
    description: raw.description || 'Cobro Mercado Pago',
    externalReference: raw.external_reference,
    cardLastFourDigits: raw.card?.last_four_digits,
    payer: {
      id: payer.id ? String(payer.id) : undefined,
      firstName,
      lastName,
      fullName,
      email: payer.email || '',
      phone: payer.phone?.number ? `${payer.phone.area_code || ''} ${payer.phone.number}`.trim() : undefined,
      identificationType: identification.number ? identification.type : undefined,
      identificationNumber: identification.number,
    },
  };
}

export type PaymentStatus = 'approved' | 'in_process' | 'rejected' | 'refunded' | 'pending' | 'authorized' | 'cancelled' | 'in_mediation' | 'charged_back' | 'other_account';

export type SaleVerificationStatus = 'pending' | 'accepted' | 'rejected';

export interface PayerInfo {
  id?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone?: string;
  identificationType?: string;
  identificationNumber?: string;
}

export interface SaleVerification {
  status: SaleVerificationStatus;
  acceptedAt?: string;
  acceptedBy?: string;
  saleTicketNumber?: string;
  productOrConcept?: string;
  internalNotes?: string;
}

export interface PaymentItem {
  id: string;
  dateCreated: string;
  dateApproved: string | null;
  transactionAmountRefunded?: number;
  operationType?: string;
  status: PaymentStatus;
  statusDetail: string;
  transactionAmount: number;
  netReceivedAmount: number;
  feeAmount: number;
  currencyId: string;
  paymentMethodId: string;
  paymentTypeId: string;
  installments: number;
  description: string;
  externalReference?: string;
  cardLastFourDigits?: string;
  payer: PayerInfo;
  saleVerification: SaleVerification;
  source: 'webhook' | 'api_sync' | 'simulation';
  qrCode?: string;
}

export interface LinkedMpAccount {
  id: string | number;
  nickname: string;
  email: string;
  firstName?: string;
  lastName?: string;
  linkedAt: string;
  state: 'active' | 'needs_reauth';
}

export interface MpStatus {
  configured: boolean;
  needsReauth: boolean;
  oauthReady: boolean;
  linkedAccount: LinkedMpAccount | null;
  revision: number;
}

export interface AppServerStatus extends MpStatus {
  appUrl: string;
}

export interface SessionInfo {
  authenticated: boolean;
  role?: 'owner' | 'seller';
  userName?: string;
  businessName?: string;
  setupMissing: string[];
  storage: 'firestore' | 'file' | null;
  allowSimulation: boolean;
  registrationRequiresCode: boolean;
}

/** Waiting for the cashier: only money Mercado Pago already approved. */
export const MP_STATUS_LABELS: Record<string, string> = {
  pending: 'pendiente',
  in_process: 'en revisión',
  authorized: 'autorizado sin acreditar',
  rejected: 'rechazado',
  cancelled: 'cancelado',
  refunded: 'devuelto',
  in_mediation: 'en mediación',
  charged_back: 'con contracargo',
  other_account: 'de otra cuenta de Mercado Pago',
};

/** Mercado Pago doesn't say who sent it: the cashier has to check amount and time. */
export function hasUnknownPayer(payment: PaymentItem): boolean {
  return payment.source !== 'simulation' && !payment.payer.email && !payment.payer.identificationNumber;
}

export function needsApproval(payment: PaymentItem): boolean {
  return payment.status === 'approved' && payment.saleVerification.status === 'pending';
}

export interface VerifySalePayload {
  saleTicketNumber: string;
  productOrConcept: string;
  acceptedBy: string;
  internalNotes?: string;
}


export type PaymentStatus = 'approved' | 'in_process' | 'rejected' | 'refunded' | 'pending';

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
  countryId?: string;
  siteId?: string;
  linkedAt: string;
  authMethod: 'oauth' | 'token' | 'demo';
}

export interface AppServerStatus {
  configured: boolean;
  hasAccessToken: boolean;
  appUrl: string;
  webhookUrl: string;
  totalPayments: number;
  pendingCount: number;
  acceptedCount: number;
  todayTotal: number;
  connectedDevices?: number;
  mpAccountEmail?: string;
  linkedAccount?: LinkedMpAccount | null;
  clientId?: string;
}

export interface VerifySalePayload {
  saleTicketNumber: string;
  productOrConcept: string;
  acceptedBy: string;
  internalNotes?: string;
}

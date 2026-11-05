export interface PayerData {
  id?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone?: string;
  identificationType?: string;
  identificationNumber?: string;
}

export interface SaleVerificationData {
  status: 'pending' | 'accepted' | 'rejected';
  acceptedAt?: string;
  acceptedBy?: string;
  saleTicketNumber?: string;
  productOrConcept?: string;
  internalNotes?: string;
}

/** Fields that always come from Mercado Pago; a sale decision never overwrites them. */
export interface MpPaymentFields {
  id: string;
  dateCreated: string;
  dateApproved: string | null;
  status: string;
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
  payer: PayerData;
}

export interface PaymentRecord extends MpPaymentFields {
  saleVerification: SaleVerificationData;
  source: 'webhook' | 'api_sync' | 'simulation';
}

export interface MpConnection {
  userId: string;
  nickname: string;
  email: string;
  firstName?: string;
  lastName?: string;
  countryId?: string;
  siteId?: string;
  linkedAt: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  /** ISO date when the access token stops working. */
  expiresAt: string;
  state: 'active' | 'needs_reauth';
}

export interface Merchant {
  id: string;
  businessName: string;
  ownerEmail: string;
  passwordHash: string;
  /** Set to false in the database to cut off a merchant (for example, unpaid subscription). */
  active: boolean;
  createdAt: string;
  /** Raising a version closes every open session of that role. */
  ownerSessionVersion: number;
  sellerSessionVersion: number;
  sellerCodeHash: string;
  sellerCodeEnc: string;
  mpUserId: string | null;
  mp: MpConnection | null;
  /** Grows whenever this merchant's payments change, so devices can poll cheaply. */
  revision: number;
}

export type Role = 'owner' | 'seller';

export interface SessionData {
  mid: string;
  role: Role;
  ver: number;
  name: string;
  exp: number;
}

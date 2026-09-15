import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

// Persistent data directory
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'payments.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Server-Sent Events (SSE) clients
const sseClients = new Set<Response>();

function broadcastSSE(event: string, data: unknown) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch {
      sseClients.delete(client);
    }
  }
}

// In-memory payment repository
interface PayerData {
  id?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone?: string;
  identificationType?: string;
  identificationNumber?: string;
}

interface SaleVerificationData {
  status: 'pending' | 'accepted' | 'rejected';
  acceptedAt?: string;
  acceptedBy?: string;
  saleTicketNumber?: string;
  productOrConcept?: string;
  internalNotes?: string;
}

interface PaymentRecord {
  id: string;
  dateCreated: string;
  dateApproved: string | null;
  status: 'approved' | 'in_process' | 'rejected' | 'refunded' | 'pending';
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
  saleVerification: SaleVerificationData;
  source: 'webhook' | 'api_sync' | 'simulation';
  qrCode?: string;
}

// Seed initial realistic payments for immediate demonstration
const defaultInitialPayments: PaymentRecord[] = [
  {
    id: '89304992104',
    dateCreated: new Date().toISOString(),
    dateApproved: new Date().toISOString(),
    status: 'approved',
    statusDetail: 'accredited',
    transactionAmount: 5,
    netReceivedAmount: 5,
    feeAmount: 0,
    currencyId: 'ARS',
    paymentMethodId: 'account_money',
    paymentTypeId: 'account_money',
    installments: 1,
    description: 'Transferencia Mercado Pago / CVU',
    payer: {
      firstName: 'Nahuel',
      lastName: 'Benítez',
      fullName: 'Nahuel Benítez',
      email: 'nahueby17@gmail.com',
      phone: '+54 9 11 4981-2290',
      identificationType: 'DNI',
      identificationNumber: '42109844',
    },
    saleVerification: {
      status: 'pending',
    },
    source: 'simulation',
  },
  {
    id: '89304192834',
    dateCreated: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    dateApproved: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    status: 'approved',
    statusDetail: 'accredited',
    transactionAmount: 48500,
    netReceivedAmount: 46800,
    feeAmount: 1700,
    currencyId: 'ARS',
    paymentMethodId: 'visa',
    paymentTypeId: 'credit_card',
    installments: 1,
    description: 'Cobro por Mostrador - Zapatillas Running Talle 42',
    cardLastFourDigits: '4921',
    payer: {
      firstName: 'Gonzalo',
      lastName: 'Pérez',
      fullName: 'Gonzalo Pérez',
      email: 'gonzalo.perez.92@gmail.com',
      phone: '+54 9 11 4892-3310',
      identificationType: 'DNI',
      identificationNumber: '38492019',
    },
    saleVerification: {
      status: 'pending',
    },
    source: 'simulation',
  },
  {
    id: '89303881290',
    dateCreated: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    dateApproved: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    status: 'approved',
    statusDetail: 'accredited',
    transactionAmount: 18200,
    netReceivedAmount: 17560,
    feeAmount: 640,
    currencyId: 'ARS',
    paymentMethodId: 'account_money',
    paymentTypeId: 'account_money',
    installments: 1,
    description: 'Transferencia Mercado Pago / CVU',
    payer: {
      firstName: 'Mariana',
      lastName: 'Alonso',
      fullName: 'Mariana Alonso',
      email: 'marian.alonso@outlook.com',
      phone: '+54 9 11 6501-8842',
      identificationType: 'DNI',
      identificationNumber: '35108221',
    },
    saleVerification: {
      status: 'accepted',
      acceptedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      acceptedBy: 'Caja 1 - Lucas',
      saleTicketNumber: 'TK-0001-0004918',
      productOrConcept: 'Remera Algodón Estampada x2',
      internalNotes: 'Cliente retiró en el local con DNI.',
    },
    source: 'simulation',
  },
];

function loadPersistedPayments(): PaymentRecord[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load persisted payments:', err);
  }
  return defaultInitialPayments;
}

const paymentsStore: PaymentRecord[] = loadPersistedPayments();

function savePersistedPayments() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(paymentsStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist payments to disk:', err);
  }
}

// Mercado Pago Linked Account & Credentials store
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

export interface MpCredentials {
  accessToken: string;
  clientId?: string;
  clientSecret?: string;
  linkedAccount?: LinkedMpAccount | null;
}

const CREDENTIALS_FILE = path.join(DATA_DIR, 'mp_credentials.json');

function loadPersistedCredentials(): MpCredentials {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load mp_credentials:', err);
  }
  return {
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
    clientId: process.env.MERCADOPAGO_CLIENT_ID || '',
    clientSecret: process.env.MERCADOPAGO_CLIENT_SECRET || '',
    linkedAccount: null,
  };
}

const credentialsStore: MpCredentials = loadPersistedCredentials();

function savePersistedCredentials() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentialsStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist credentials to disk:', err);
  }
}

function getMpToken(): string {
  return credentialsStore.accessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
}

function getMpClientId(): string {
  return credentialsStore.clientId || process.env.MERCADOPAGO_CLIENT_ID || '';
}

function getMpClientSecret(): string {
  return credentialsStore.clientSecret || process.env.MERCADOPAGO_CLIENT_SECRET || '';
}

interface FetchProfileResult {
  profile: LinkedMpAccount | null;
  error?: string;
  isUnauthorized?: boolean;
}

async function fetchMpAccountProfile(
  token: string,
  authMethod: 'oauth' | 'token' | 'demo' = 'token',
): Promise<FetchProfileResult> {
  if (!token) return { profile: null };
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        profile: {
          id: data.id,
          nickname: data.nickname || `${data.first_name || 'Comercio'} MP`,
          email: data.email || 'usuario@mercadopago.com',
          firstName: data.first_name || '',
          lastName: data.last_name || '',
          countryId: data.country_id || 'MLA',
          siteId: data.site_id || 'MLA',
          linkedAt: new Date().toISOString(),
          authMethod,
        },
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        profile: null,
        isUnauthorized: true,
        error: 'El Access Token ingresado no fue reconocido por Mercado Pago (inválido o expirado). Copia el Access Token de "Credenciales de producción".',
      };
    }

    return { profile: null, error: `Mercado Pago respondió con código ${res.status}` };
  } catch (err: unknown) {
    console.error('Error querying MP users/me:', err);
    return { profile: null, error: 'Tiempo de espera agotado al conectar con Mercado Pago.' };
  }
}

// Memory store for Mercado Pago access token if configured via UI
let dynamicMpToken: string = getMpToken();

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

// SSE stream for real-time notifications across all devices
const handleSSEConnection = (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  res.write(': sse connected\n\n');
  sseClients.add(res);

  // Send initial device status handshake
  const initPayload = {
    connectedDevices: sseClients.size,
    serverTime: new Date().toISOString(),
    totalPayments: paymentsStore.length,
    pendingCount: paymentsStore.filter((p) => p.saleVerification.status === 'pending').length,
  };
  res.write(`event: init:sync\ndata: ${JSON.stringify(initPayload)}\n\n`);

  // Broadcast device count update to all other connected screens
  broadcastSSE('devices:count', { connectedDevices: sseClients.size });

  const heartbeatInterval = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(heartbeatInterval);
      sseClients.delete(res);
      broadcastSSE('devices:count', { connectedDevices: sseClients.size });
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeatInterval);
    sseClients.delete(res);
    broadcastSSE('devices:count', { connectedDevices: sseClients.size });
  });
};

app.get('/api/events', handleSSEConnection);
app.get('/api/live/stream', handleSSEConnection);

// App status & stats
app.get('/api/status', async (req: Request, res: Response) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;

  const token = getMpToken();
  const clientId = getMpClientId();
  const today = new Date().toISOString().split('T')[0];

  const todayApprovedPayments = paymentsStore.filter(
    (p) => p.status === 'approved' && p.dateCreated.startsWith(today),
  );

  const todayTotal = todayApprovedPayments.reduce((acc, p) => acc + p.transactionAmount, 0);
  const pendingCount = paymentsStore.filter((p) => p.saleVerification.status === 'pending').length;
  const acceptedCount = paymentsStore.filter((p) => p.saleVerification.status === 'accepted').length;

  // Lazy populate linkedAccount details if token exists
  if (token && !credentialsStore.linkedAccount) {
    try {
      const res = await fetchMpAccountProfile(token);
      if (res.profile) {
        credentialsStore.linkedAccount = res.profile;
        savePersistedCredentials();
      }
    } catch {
      // ignore
    }
  }

  res.json({
    configured: Boolean(token && token.length > 10),
    hasAccessToken: Boolean(token && token.length > 10),
    appUrl: baseUrl,
    webhookUrl: `${baseUrl}/api/webhooks/mercadopago`,
    totalPayments: paymentsStore.length,
    pendingCount,
    acceptedCount,
    todayTotal,
    connectedDevices: Math.max(1, sseClients.size),
    mpAccountEmail: credentialsStore.linkedAccount?.email || (token ? 'Vinculado a Mercado Pago' : undefined),
    linkedAccount: credentialsStore.linkedAccount || null,
    clientId: clientId || undefined,
  });
});

// GET /api/auth/mercadopago/url: Generates official Mercado Pago authorization URL
app.get('/api/auth/mercadopago/url', (req: Request, res: Response) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
  const redirectUri = `${baseUrl}/api/auth/mercadopago/callback`;

  const clientId = (req.query.client_id as string) || getMpClientId();
  const state = Math.random().toString(36).substring(2, 15);

  if (!clientId) {
    res.status(400).json({
      error: 'Se requiere el Client ID (App ID) de tu aplicación de Mercado Pago.',
      redirectUri,
    });
    return;
  }

  // Official Mercado Pago OAuth URL
  const authUrl = `https://auth.mercadopago.com.ar/authorization?client_id=${clientId}&response_type=code&platform_id=mp&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  res.json({
    authUrl,
    redirectUri,
    clientId,
  });
});

// GET /api/auth/mercadopago/callback: Receives redirect from Mercado Pago and exchanges token
app.get('/api/auth/mercadopago/callback', async (req: Request, res: Response) => {
  const { code, error, error_description } = req.query;
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
  const redirectUri = `${baseUrl}/api/auth/mercadopago/callback`;

  if (error) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Error al vincular Mercado Pago</title><meta charset="utf-8"/></head>
        <body style="font-family:sans-serif;padding:30px;text-align:center;background:#0f172a;color:#f8fafc;">
          <h2 style="color:#ef4444;">No se pudo autorizar Mercado Pago</h2>
          <p>${error_description || error}</p>
          <a href="/" style="color:#38bdf8;">Volver a la aplicación</a>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'MP_AUTH_ERROR', error: '${error}' }, '*');
              setTimeout(() => window.close(), 2500);
            }
          </script>
        </body>
      </html>
    `);
    return;
  }

  const clientId = getMpClientId();
  const clientSecret = getMpClientSecret();

  if (!code || !clientSecret || !clientId) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Faltan credenciales</title><meta charset="utf-8"/></head>
        <body style="font-family:sans-serif;padding:30px;text-align:center;background:#0f172a;color:#f8fafc;">
          <h2 style="color:#f59e0b;">Falta configurar Client Secret en la aplicación</h2>
          <p>Para completar el intercambio OAuth, ingresa a la app y configura tu Client Secret.</p>
          <a href="/" style="color:#38bdf8;">Volver a la aplicación</a>
        </body>
      </html>
    `);
    return;
  }

  try {
    const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_secret: clientSecret,
        client_id: clientId,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('OAuth token exchange error:', tokenData);
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <body style="font-family:sans-serif;padding:30px;text-align:center;background:#0f172a;color:#f8fafc;">
            <h2 style="color:#ef4444;">Error en el intercambio de tokens de Mercado Pago</h2>
            <p>${tokenData.message || 'Intenta nuevamente desde la aplicación'}</p>
            <a href="/" style="color:#38bdf8;">Volver a la aplicación</a>
          </body>
        </html>
      `);
      return;
    }

    credentialsStore.accessToken = tokenData.access_token;
    dynamicMpToken = tokenData.access_token;

    // Fetch profile
    const profileRes = await fetchMpAccountProfile(tokenData.access_token, 'oauth');
    credentialsStore.linkedAccount = profileRes.profile || {
      id: tokenData.user_id,
      nickname: `Usuario MP #${tokenData.user_id}`,
      email: 'vinculado@mercadopago.com',
      linkedAt: new Date().toISOString(),
      authMethod: 'oauth',
    };

    savePersistedCredentials();
    broadcastSSE('account:linked', credentialsStore.linkedAccount);

    // Friendly HTML response that notifies opener and redirects
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>¡Mercado Pago Vinculado con Éxito!</title>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b1329; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
            .card { background: #111d3d; border: 1px solid #1e3a8a; border-radius: 24px; padding: 32px; max-width: 440px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
            .badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.4); color: #4ade80; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: bold; margin-bottom: 16px; }
            h1 { font-size: 22px; margin: 0 0 8px 0; color: #ffffff; }
            p { color: #94a3b8; font-size: 14px; line-height: 1.5; margin: 0 0 24px 0; }
            .btn { display: inline-block; background: #009ee3; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px; transition: 0.2s; }
            .btn:hover { background: #0084bf; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">✓ Vinculación Exitosa</div>
            <h1>¡Mercado Pago Conectado!</h1>
            <p>Tu cuenta de Mercado Pago <strong>${credentialsStore.linkedAccount.nickname}</strong> se ha vinculado correctamente a la aplicación.</p>
            <a href="/?mp_linked=true" class="btn">Continuar a la Aplicación</a>
          </div>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({ type: 'MP_AUTH_SUCCESS', account: ${JSON.stringify(credentialsStore.linkedAccount)} }, '*');
                setTimeout(() => {
                  window.close();
                }, 1500);
              } else {
                setTimeout(() => {
                  window.location.href = '/?mp_linked=true';
                }, 2000);
              }
            } catch (e) {
              window.location.href = '/?mp_linked=true';
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).send('Error interno al vincular cuenta.');
  }
});

// Shared handler for linking manual Mercado Pago token
const handleLinkManualToken = async (req: Request, res: Response) => {
  const { accessToken, clientId, clientSecret, isDemo } = req.body;

  if (isDemo) {
    const demoAccount: LinkedMpAccount = {
      id: 984021948,
      nickname: 'Mi Tienda Mercado Pago',
      email: 'mi.tienda@mercadopago.com',
      firstName: 'Comercio',
      lastName: 'Oficial',
      countryId: 'MLA',
      siteId: 'MLA',
      linkedAt: new Date().toISOString(),
      authMethod: 'demo',
    };
    credentialsStore.accessToken = 'TEST-DEMO-TOKEN-ACTIVE-VERIFIED';
    credentialsStore.linkedAccount = demoAccount;
    dynamicMpToken = credentialsStore.accessToken;
    savePersistedCredentials();
    broadcastSSE('account:linked', demoAccount);
    res.json({ success: true, account: demoAccount });
    return;
  }

  const rawToken = String(accessToken || '');
  const cleanToken = rawToken
    .trim()
    .replace(/^["'`\s]+/, '')
    .replace(/["'`\s]+$/, '')
    .trim();

  if (!cleanToken || cleanToken.length < 15) {
    res.status(400).json({
      error: 'Ingresa un Access Token válido (debe tener al menos 15 caracteres y comenzar usualmente con APP_USR- o TEST-)',
    });
    return;
  }

  // Validate with Mercado Pago API
  const profileRes = await fetchMpAccountProfile(cleanToken, 'token');

  if (profileRes.isUnauthorized) {
    res.status(401).json({
      error: 'Mercado Pago rechazó este Access Token (inválido o expirado). Por favor verifica haber copiado el Access Token de tus "Credenciales de producción" en tu cuenta.',
    });
    return;
  }

  credentialsStore.accessToken = cleanToken;
  dynamicMpToken = cleanToken;

  if (clientId) credentialsStore.clientId = String(clientId).trim();
  if (clientSecret) credentialsStore.clientSecret = String(clientSecret).trim();

  if (profileRes.profile) {
    credentialsStore.linkedAccount = profileRes.profile;
  } else {
    // MP API might be unreachable, create fallback linked account
    credentialsStore.linkedAccount = {
      id: 'MP-' + cleanToken.slice(-8),
      nickname: 'Cuenta Mercado Pago Vinculada',
      email: 'cuenta@mercadopago.com',
      linkedAt: new Date().toISOString(),
      authMethod: 'token',
    };
  }

  savePersistedCredentials();
  broadcastSSE('account:linked', credentialsStore.linkedAccount);

  res.json({ success: true, account: credentialsStore.linkedAccount });
};

// Support both endpoint paths (in case ad-blockers block the word 'mercadopago')
app.post('/api/auth/mercadopago/link-manual', handleLinkManualToken);
app.post('/api/link-token', handleLinkManualToken);

// POST /api/auth/mercadopago/save-app-credentials
app.post('/api/auth/mercadopago/save-app-credentials', (req: Request, res: Response) => {
  const { clientId, clientSecret } = req.body;
  if (clientId) credentialsStore.clientId = String(clientId).trim();
  if (clientSecret) credentialsStore.clientSecret = String(clientSecret).trim();
  savePersistedCredentials();
  res.json({ success: true, clientId: credentialsStore.clientId });
});

// POST /api/auth/mercadopago/unlink
app.post('/api/auth/mercadopago/unlink', (req: Request, res: Response) => {
  credentialsStore.accessToken = '';
  credentialsStore.linkedAccount = null;
  dynamicMpToken = '';
  savePersistedCredentials();
  broadcastSSE('account:unlinked', {});
  res.json({ success: true });
});

// Save or update Mercado Pago Access Token
app.post('/api/config/token', async (req: Request, res: Response) => {
  const { accessToken } = req.body;
  if (typeof accessToken === 'string') {
    const clean = accessToken.trim().replace(/^["'`\s]+/, '').replace(/["'`\s]+$/, '').trim();
    credentialsStore.accessToken = clean;
    dynamicMpToken = credentialsStore.accessToken;
    if (dynamicMpToken) {
      const profileRes = await fetchMpAccountProfile(dynamicMpToken, 'token');
      credentialsStore.linkedAccount = profileRes.profile || {
        id: 'MP-' + clean.slice(-8),
        nickname: 'Cuenta Mercado Pago Vinculada',
        email: 'cuenta@mercadopago.com',
        linkedAt: new Date().toISOString(),
        authMethod: 'token',
      };
    } else {
      credentialsStore.linkedAccount = null;
    }
    savePersistedCredentials();
  }
  res.json({ success: true, configured: Boolean(dynamicMpToken) });
});

// List all payments
app.get('/api/payments', (req: Request, res: Response) => {
  const { status, query, saleStatus } = req.query;

  let list = [...paymentsStore];

  if (status && typeof status === 'string') {
    list = list.filter((p) => p.status === status);
  }

  if (saleStatus && typeof saleStatus === 'string') {
    list = list.filter((p) => p.saleVerification.status === saleStatus);
  }

  if (query && typeof query === 'string') {
    const q = query.toLowerCase().trim();
    list = list.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.payer.fullName.toLowerCase().includes(q) ||
        p.payer.email.toLowerCase().includes(q) ||
        (p.payer.identificationNumber && p.payer.identificationNumber.includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.saleVerification.saleTicketNumber && p.saleVerification.saleTicketNumber.toLowerCase().includes(q)),
    );
  }

  // Sort newest first
  list.sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime());

  res.json({ payments: list });
});

// Verify & Accept payment as Sale
app.post('/api/payments/:id/verify-sale', (req: Request, res: Response) => {
  const { id } = req.params;
  const { saleTicketNumber, productOrConcept, acceptedBy, internalNotes, status } = req.body;

  const payment = paymentsStore.find((p) => p.id === id);
  if (!payment) {
    res.status(404).json({ error: 'Pago no encontrado' });
    return;
  }

  const newStatus = status === 'rejected' ? 'rejected' : 'accepted';

  payment.saleVerification = {
    status: newStatus,
    acceptedAt: new Date().toISOString(),
    acceptedBy: acceptedBy || 'Cajero / Administrador',
    saleTicketNumber: saleTicketNumber || `VTA-${Date.now().toString().slice(-6)}`,
    productOrConcept: productOrConcept || payment.description || 'Venta de productos',
    internalNotes: internalNotes || '',
  };

  broadcastSSE('payment:verified', payment);
  savePersistedPayments();

  res.json({ success: true, payment });
});

// Helper to query Mercado Pago API for payment details
async function fetchMpPaymentDetails(paymentId: string): Promise<Partial<PaymentRecord> | null> {
  const token = getMpToken();
  if (!token) return null;

  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.warn(`[MercadoPago API] Failed to fetch payment ${paymentId}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    const payer = data.payer || {};
    const identification = payer.identification || {};
    const phone = payer.phone || {};

    const firstName = payer.first_name || '';
    const lastName = payer.last_name || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || payer.email || 'Cliente Mercado Pago';

    const feeAmount = Array.isArray(data.fee_details)
      ? data.fee_details.reduce((sum: number, fee: { amount: number }) => sum + (fee.amount || 0), 0)
      : 0;

    return {
      id: String(data.id),
      dateCreated: data.date_created || new Date().toISOString(),
      dateApproved: data.date_approved || null,
      status: data.status,
      statusDetail: data.status_detail || '',
      transactionAmount: data.transaction_amount || 0,
      netReceivedAmount: data.transaction_amount ? data.transaction_amount - feeAmount : 0,
      feeAmount,
      currencyId: data.currency_id || 'ARS',
      paymentMethodId: data.payment_method_id || 'mercadopago',
      paymentTypeId: data.payment_type_id || 'other',
      installments: data.installments || 1,
      description: data.description || 'Cobro Mercado Pago',
      externalReference: data.external_reference,
      cardLastFourDigits: data.card?.last_four_digits,
      payer: {
        id: payer.id ? String(payer.id) : undefined,
        firstName,
        lastName,
        fullName,
        email: payer.email || '',
        phone: phone.number ? `${phone.area_code || ''} ${phone.number}` : undefined,
        identificationType: identification.type || 'DNI',
        identificationNumber: identification.number || undefined,
      },
    };
  } catch (err) {
    console.error('[MercadoPago API Error]:', err);
    return null;
  }
}

// MERCADO PAGO WEBHOOK RECEIVER
// Called automatically by Mercado Pago when a payment event happens
app.post('/api/webhooks/mercadopago', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const query = req.query || {};

    // Extract payment ID from body or query (Mercado Pago supports both Webhooks and IPN)
    const paymentId =
      body.data?.id ||
      body.id ||
      query['data.id'] ||
      query.id;

    const topic = body.type || body.topic || query.type || query.topic;

    console.log(`[Webhook MP Received] ID: ${paymentId}, Topic/Type: ${topic}`);

    if (paymentId) {
      let paymentRecord: PaymentRecord | null = null;
      const existing = paymentsStore.find((p) => p.id === String(paymentId));

      // Attempt to fetch fresh data from official Mercado Pago API
      const mpData = await fetchMpPaymentDetails(String(paymentId));

      if (mpData && mpData.id) {
        if (existing) {
          // Update existing
          Object.assign(existing, mpData);
          paymentRecord = existing;
          broadcastSSE('payment:updated', paymentRecord);
        } else {
          // Add new payment
          paymentRecord = {
            id: mpData.id,
            dateCreated: mpData.dateCreated || new Date().toISOString(),
            dateApproved: mpData.dateApproved || new Date().toISOString(),
            status: mpData.status || 'approved',
            statusDetail: mpData.statusDetail || 'accredited',
            transactionAmount: mpData.transactionAmount || 0,
            netReceivedAmount: mpData.netReceivedAmount || 0,
            feeAmount: mpData.feeAmount || 0,
            currencyId: mpData.currencyId || 'ARS',
            paymentMethodId: mpData.paymentMethodId || 'mercadopago',
            paymentTypeId: mpData.paymentTypeId || 'other',
            installments: mpData.installments || 1,
            description: mpData.description || 'Cobro recibido por Mercado Pago',
            cardLastFourDigits: mpData.cardLastFourDigits,
            payer: mpData.payer || {
              firstName: 'Cliente',
              lastName: 'Mercado Pago',
              fullName: 'Cliente Mercado Pago',
              email: 'cliente@mercadopago.com',
            },
            saleVerification: { status: 'pending' },
            source: 'webhook',
          };
          paymentsStore.unshift(paymentRecord);
          broadcastSSE('payment:created', paymentRecord);
          savePersistedPayments();
        }
      } else {
        // If API token is not yet configured or sandbox fallback
        const amount = body.transaction_amount || (body.data && body.data.transaction_amount) || 15000;
        const payerName = body.payer?.first_name ? `${body.payer.first_name} ${body.payer.last_name || ''}`.trim() : 'Cliente Mercado Pago';

        if (!existing) {
          paymentRecord = {
            id: String(paymentId),
            dateCreated: new Date().toISOString(),
            dateApproved: new Date().toISOString(),
            status: 'approved',
            statusDetail: 'accredited',
            transactionAmount: Number(amount),
            netReceivedAmount: Math.round(Number(amount) * 0.965),
            feeAmount: Math.round(Number(amount) * 0.035),
            currencyId: 'ARS',
            paymentMethodId: body.payment_method_id || 'mercadopago',
            paymentTypeId: body.payment_type_id || 'account_money',
            installments: 1,
            description: body.description || 'Cobro recibido por Webhook MP',
            payer: {
              firstName: body.payer?.first_name || 'Cliente',
              lastName: body.payer?.last_name || 'Mercado Pago',
              fullName: payerName,
              email: body.payer?.email || 'cliente@mercadopago.com',
              identificationType: body.payer?.identification?.type || 'DNI',
              identificationNumber: body.payer?.identification?.number || '38194028',
            },
            saleVerification: { status: 'pending' },
            source: 'webhook',
          };
          paymentsStore.unshift(paymentRecord);
          broadcastSSE('payment:created', paymentRecord);
          savePersistedPayments();
        }
      }
    }

    // Mercado Pago expects 200/201 response within 3 seconds
    res.status(200).send('OK');
  } catch (err) {
    console.error('[Webhook MP Error]:', err);
    res.status(200).send('OK'); // Always return 200 so MP doesn't unnecessarily retry broken requests
  }
});

// Also support GET for IPN handshake verification
app.get('/api/webhooks/mercadopago', (req: Request, res: Response) => {
  res.status(200).send('Mercado Pago Webhook Endpoint Active');
});

// Sync latest payments from official Mercado Pago API
app.post('/api/mercadopago/sync', async (req: Request, res: Response) => {
  const token = getMpToken();
  if (!token) {
    res.status(400).json({ error: 'Falta configurar el Access Token de Mercado Pago' });
    return;
  }

  try {
    const response = await fetch(
      'https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=30',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({
        error: `Error al consultar Mercado Pago API (${response.status}): ${errText}`,
      });
      return;
    }

    const data = await response.json();
    const results = data.results || [];
    let addedCount = 0;

    for (const item of results) {
      const existing = paymentsStore.find((p) => p.id === String(item.id));
      if (!existing) {
        const payer = item.payer || {};
        const ident = payer.identification || {};
        const feeAmount = Array.isArray(item.fee_details)
          ? item.fee_details.reduce((s: number, f: { amount: number }) => s + (f.amount || 0), 0)
          : 0;

        const pRecord: PaymentRecord = {
          id: String(item.id),
          dateCreated: item.date_created,
          dateApproved: item.date_approved || null,
          status: item.status,
          statusDetail: item.status_detail || '',
          transactionAmount: item.transaction_amount || 0,
          netReceivedAmount: (item.transaction_amount || 0) - feeAmount,
          feeAmount,
          currencyId: item.currency_id || 'ARS',
          paymentMethodId: item.payment_method_id || 'other',
          paymentTypeId: item.payment_type_id || 'other',
          installments: item.installments || 1,
          description: item.description || 'Cobro Mercado Pago',
          cardLastFourDigits: item.card?.last_four_digits,
          payer: {
            id: payer.id ? String(payer.id) : undefined,
            firstName: payer.first_name || '',
            lastName: payer.last_name || '',
            fullName: [payer.first_name, payer.last_name].filter(Boolean).join(' ') || payer.email || 'Cliente MP',
            email: payer.email || '',
            identificationType: ident.type || 'DNI',
            identificationNumber: ident.number,
          },
          saleVerification: { status: 'pending' },
          source: 'api_sync',
        };

        paymentsStore.push(pRecord);
        addedCount++;
      }
    }

    paymentsStore.sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime());
    savePersistedPayments();

    res.json({ success: true, count: addedCount, total: paymentsStore.length });
  } catch (err) {
    console.error('[Sync MP Error]:', err);
    res.status(500).json({ error: 'Error al sincronizar con Mercado Pago' });
  }
});

// SIMULATOR ENDPOINT: Generates a real-time incoming payment with customer details
app.post('/api/payments/simulate', (req: Request, res: Response) => {
  const clientNames = [
    { first: 'Nahuel', last: 'Benítez', email: 'nahueby17@gmail.com', dni: '42109844', phone: '+54 9 11 4981-2290' },
    { first: 'Martín', last: 'Gómez', dni: '40192843', phone: '+54 9 11 5829-1102' },
    { first: 'Florencia', last: 'Rossi', dni: '39201948', phone: '+54 9 11 3910-4491' },
    { first: 'Esteban', last: 'Fernández', dni: '34910283', phone: '+54 9 341 690-2188' },
    { first: 'Valeria', last: 'Benítez', dni: '42819034', phone: '+54 9 351 449-3301' },
    { first: 'Agustín', last: 'Romero', dni: '37194029', phone: '+54 9 11 2844-9910' },
    { first: 'Camila', last: 'Sosa', dni: '41092834', phone: '+54 9 11 7710-3329' },
  ];

  const paymentMethods = [
    { method: 'visa', type: 'credit_card', lastFour: '8834' },
    { method: 'master', type: 'debit_card', lastFour: '1209' },
    { method: 'account_money', type: 'account_money' },
    { method: 'qr_transfer', type: 'bank_transfer' },
  ];

  const concepts = [
    'Cobro Mostrador - Calzado Deportivo',
    'Venta Presencial - Indumentaria y Accesorios',
    'Pago QR - Almuerzo Ejecutivo x2',
    'Venta en Caja - Auriculares Bluetooth Pro',
    'Cobro Factura B - Repuestos y Accesorios',
    'Pago Mostrador - Mochila Urbana Impermeable',
  ];

  const randomClient = clientNames[Math.floor(Math.random() * clientNames.length)];
  const randomPM = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
  const randomConcept = concepts[Math.floor(Math.random() * concepts.length)];
  const amount = Math.floor(Math.random() * 65 + 12) * 1000 + (Math.random() > 0.5 ? 500 : 0); // e.g., $18,500 to $76,000

  const feeRate = randomPM.type === 'credit_card' ? 0.045 : randomPM.type === 'debit_card' ? 0.025 : 0.015;
  const feeAmount = Math.round(amount * feeRate);
  const netAmount = amount - feeAmount;

  const newPayment: PaymentRecord = {
    id: String(Math.floor(89000000000 + Math.random() * 999999999)),
    dateCreated: new Date().toISOString(),
    dateApproved: new Date().toISOString(),
    status: 'approved',
    statusDetail: 'accredited',
    transactionAmount: amount,
    netReceivedAmount: netAmount,
    feeAmount,
    currencyId: 'ARS',
    paymentMethodId: randomPM.method,
    paymentTypeId: randomPM.type,
    installments: 1,
    description: req.body?.description || randomConcept,
    cardLastFourDigits: randomPM.lastFour,
    payer: {
      firstName: req.body?.payerName || randomClient.first,
      lastName: randomClient.last,
      fullName: `${req.body?.payerName || randomClient.first} ${randomClient.last}`,
      email: `${(req.body?.payerName || randomClient.first).toLowerCase()}.${randomClient.last.toLowerCase()}@gmail.com`,
      phone: randomClient.phone,
      identificationType: 'DNI',
      identificationNumber: randomClient.dni,
    },
    saleVerification: {
      status: 'pending',
    },
    source: 'simulation',
  };

  paymentsStore.unshift(newPayment);

  // Broadcast in real-time to all connected browser sessions
  broadcastSSE('payment:created', newPayment);
  savePersistedPayments();

  res.json({ success: true, payment: newPayment });
});

// Broadcast a cross-device test ping with chime to verify real-time sync across all phones & PCs
app.post('/api/devices/ping', (req: Request, res: Response) => {
  broadcastSSE('devices:ping', {
    timestamp: new Date().toISOString(),
    message: 'Prueba de sonido y sincronización en vivo',
    from: req.body?.device || 'Dispositivo',
  });
  res.json({ success: true, activeDevices: sseClients.size });
});

// Delete payment (e.g. for testing cleanup)
app.delete('/api/payments/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = paymentsStore.findIndex((p) => p.id === id);
  if (index >= 0) {
    paymentsStore.splice(index, 1);
    broadcastSSE('payment:deleted', { id });
    savePersistedPayments();
  }
  res.json({ success: true });
});

// -------------------------------------------------------------
// VITE MIDDLEWARE & SERVER STARTUP
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

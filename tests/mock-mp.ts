import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

/** Stand-in for Mercado Pago: OAuth, tokens and payments, with per-seller data. */
export class MockMp {
  server!: Server;
  base = '';
  /** code -> seller id */
  codes = new Map<string, string>();
  tokens = new Map<string, string>(); // access token -> seller id
  refreshTokens = new Map<string, string>();
  payments = new Map<string, any>();
  rejectRefresh = false;
  refreshStatus = 0;
  down = false;
  refreshCount = 0;
  searchCount = 0;
  private counter = 0;

  async start() {
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    const guard = (req: any, res: any) => {
      if (this.down) {
        res.status(503).json({ message: 'down' });
        return null;
      }
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const seller = this.tokens.get(token);
      if (!seller) {
        res.status(401).json({ message: 'invalid_token' });
        return null;
      }
      return seller;
    };
    // Authorization page: approves right away and returns to the app.
    app.get('/authorization', (req, res) => {
      const seller = (req.query.client_id === 'app-1' && process.env.MOCK_SELLER) || 'seller-a';
      const code = `code-${++this.counter}`;
      this.codes.set(code, seller);
      res.redirect(`${req.query.redirect_uri}?code=${code}&state=${encodeURIComponent(String(req.query.state))}`);
    });
    app.post('/oauth/token', (req, res) => {
      const { grant_type, code, refresh_token, client_secret } = req.body;
      if (client_secret !== 'secret-1') return void res.status(401).json({ message: 'bad client' });
      let seller: string | undefined;
      if (grant_type === 'authorization_code') {
        seller = this.codes.get(code);
        this.codes.delete(code);
      } else if (grant_type === 'refresh_token') {
        this.refreshCount += 1;
        if (this.refreshStatus) return void res.status(this.refreshStatus).json({ message: 'otro error' });
        if (this.rejectRefresh) return void res.status(400).json({ error: 'invalid_grant' });
        seller = this.refreshTokens.get(refresh_token);
        this.refreshTokens.delete(refresh_token);
      }
      if (!seller) return void res.status(400).json({ message: 'invalid_grant' });
      const n = ++this.counter;
      const access = `APP_USR-access-${seller}-${n}`;
      const refresh = `TG-refresh-${seller}-${n}`;
      this.tokens.set(access, seller);
      this.refreshTokens.set(refresh, seller);
      res.json({ access_token: access, refresh_token: refresh, expires_in: 15552000, user_id: seller, live_mode: true });
    });
    app.get('/users/me', (req, res) => {
      const seller = guard(req, res);
      if (seller) res.json({ id: seller, nickname: `TIENDA-${seller}`, email: `${seller}@mail.com`, first_name: seller });
    });
    app.get('/v1/payments/search', (req, res) => {
      const seller = guard(req, res);
      if (!seller) return;
      this.searchCount += 1;
      // Deliberately includes other people's payments: the app has to filter them out.
      res.json({ results: [...this.payments.values()] });
    });
    app.get('/v1/payments/:id', (req, res) => {
      const seller = guard(req, res);
      if (!seller) return;
      const payment = this.payments.get(req.params.id);
      if (!payment) return void res.status(404).json({ message: 'not found' });
      res.json(payment);
    });
    await new Promise<void>((resolve) => {
      this.server = app.listen(0, '127.0.0.1', () => resolve());
    });
    this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  stop() {
    this.server.closeAllConnections();
    this.server.close();
  }

  addPayment(id: string, seller: string, extra: Record<string, unknown> = {}) {
    const payment = {
      id,
      collector_id: seller,
      live_mode: true,
      date_created: new Date().toISOString(),
      date_last_updated: new Date().toISOString(),
      date_approved: new Date().toISOString(),
      status: 'approved',
      status_detail: 'accredited',
      transaction_amount: 12345,
      fee_details: [{ amount: 345 }],
      currency_id: 'ARS',
      payment_method_id: 'cvu',
      payment_type_id: 'bank_transfer',
      description: 'Transferencia',
      payer: { first_name: 'Ana', last_name: 'Paz', email: 'ana@mail.com', identification: { type: 'DNI', number: '1' } },
      ...extra,
    };
    this.payments.set(id, payment);
    return payment;
  }
}

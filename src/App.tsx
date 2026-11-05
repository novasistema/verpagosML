import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, CheckCircle2, Clock, Sparkles, Smartphone, Radio, ExternalLink, AlertCircle } from 'lucide-react';
import { Header } from './components/Header';
import { StatsBar } from './components/StatsBar';
import { PaymentCard } from './components/PaymentCard';
import { LiveAlertToast } from './components/LiveAlertToast';
import { AcceptSaleModal } from './components/AcceptSaleModal';
import { ReceiptModal } from './components/ReceiptModal';
import { InstantSaleApprovalModal } from './components/InstantSaleApprovalModal';
import { CrossDeviceSyncModal } from './components/CrossDeviceSyncModal';
import { MercadoPagoLinkModal } from './components/MercadoPagoLinkModal';
import { TeamShareModal } from './components/TeamShareModal';
import { AuthScreen, SetupRequired } from './components/AuthScreen';
import { PaymentItem, AppServerStatus, MpStatus, SessionInfo, VerifySalePayload, needsApproval } from './types';
import { soundNotifier } from './utils/audio';
import { api, ApiError } from './api';

// Each check costs a server call and a database read: slower when nobody is looking.
const POLL_VISIBLE_MS = 8000;
const POLL_HIDDEN_MS = 30000;

const MP_ERRORS: Record<string, string> = {
  cancelled: 'La autorización en Mercado Pago se canceló.',
  invalid_state: 'La autorización venció o se abrió en otra sesión. Volvé a intentarlo desde acá.',
  no_code: 'Mercado Pago no devolvió la autorización. Volvé a intentarlo.',
  already_linked: 'Esa cuenta de Mercado Pago ya está conectada a otro comercio de este sistema.',
  exchange_failed: 'Mercado Pago no pudo completar la conexión. Volvé a intentarlo en un momento.',
};

/** Decides what to show: installation pending, sign-in, or the cash desk. */
export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inviteCode] = useState<string | null>(() => new URLSearchParams(window.location.search).get('acceso'));

  const loadSession = useCallback(async () => {
    try {
      setSession(await api<SessionInfo>('/api/session'));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'No se pudo cargar la aplicación.');
    }
  }, []);

  useEffect(() => {
    loadSession();
    window.addEventListener('session-expired', loadSession);
    return () => window.removeEventListener('session-expired', loadSession);
  }, [loadSession]);

  // The invite code must not stay visible in the address bar or browser history.
  useEffect(() => {
    if (session?.authenticated && inviteCode) {
      const url = new URL(window.location.href);
      url.searchParams.delete('acceso');
      window.history.replaceState({}, document.title, url.pathname + url.search);
    }
  }, [session, inviteCode]);

  if (loadError && !session) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm">{loadError}</p>
        <button type="button" onClick={loadSession} className="px-4 py-2 rounded-xl bg-sky-600 text-sm font-bold cursor-pointer">
          Reintentar
        </button>
      </div>
    );
  }
  if (!session) {
    return <div className="min-h-screen bg-slate-900" aria-busy="true" />;
  }
  if (session.setupMissing.length > 0) {
    return <SetupRequired missing={session.setupMissing} />;
  }
  if (!session.authenticated) {
    return <AuthScreen session={session} inviteCode={inviteCode} onAuthenticated={loadSession} />;
  }
  return <Dashboard session={session} onLogout={loadSession} />;
}

function Dashboard({ session, onLogout }: { session: SessionInfo; onLogout: () => Promise<void> }) {
  const isOwner = session.role === 'owner';
  const userName = session.userName || 'Vendedor';
  const allowSimulation = session.allowSimulation && isOwner;

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [serverStatus, setServerStatus] = useState<AppServerStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [selectedPaymentForAccept, setSelectedPaymentForAccept] = useState<PaymentItem | null>(null);
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState<PaymentItem | null>(null);
  const [isDeviceSyncOpen, setIsDeviceSyncOpen] = useState(false);
  const [isMpLinkOpen, setIsMpLinkOpen] = useState(false);
  const [mpLinkError, setMpLinkError] = useState<string | null>(null);
  const [isTeamShareOpen, setIsTeamShareOpen] = useState(false);
  const [isSoundReady, setIsSoundReady] = useState(false);

  // Instant full-screen phone approval modal
  const [instantApprovalPayment, setInstantApprovalPayment] = useState<PaymentItem | null>(null);

  // Real-time live toast alert for new incoming payment
  const [newIncomingPayment, setNewIncomingPayment] = useState<PaymentItem | null>(null);

  // Loading states
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const showFeedback = useCallback((message: string, ms = 5000) => {
    setSyncFeedback(message);
    setTimeout(() => setSyncFeedback(null), ms);
  }, []);

  const revisionRef = useRef<number | null>(null);
  const waitingIdsRef = useRef<Set<string> | null>(null);

  const applyMpStatus = useCallback((mp: MpStatus) => {
    setServerStatus((prev) => (prev ? { ...prev, ...mp } : prev));
  }, []);

  /** Alerts come from comparing with the server, so every screen gets them even without live events. */
  const applyPayments = useCallback((items: PaymentItem[]) => {
    setPayments(items);
    const waiting = items.filter(needsApproval);
    const known = waitingIdsRef.current;
    if (known === null) {
      if (waiting.length > 0) setInstantApprovalPayment(waiting[0]);
    } else {
      const fresh = waiting.filter((p) => !known.has(p.id));
      if (fresh.length > 0) {
        soundNotifier.playPaymentChime();
        navigator.vibrate?.([200, 100, 200]);
        // Never swap a payment under a cashier who may be about to tap Confirm.
        setInstantApprovalPayment((current) => current ?? fresh[0]);
        setNewIncomingPayment((current) => current ?? fresh[0]);
      }
    }
    waitingIdsRef.current = new Set(waiting.map((p) => p.id));
    // Another screen resolved it: close it here too.
    const stillWaiting = waitingIdsRef.current;
    setInstantApprovalPayment((current) => (current && !stillWaiting.has(current.id) ? null : current));
    setNewIncomingPayment((current) => (current && !stillWaiting.has(current.id) ? null : current));
  }, []);

  const fetchPayments = useCallback(async () => {
    try {
      const since = revisionRef.current;
      const data = await api<{ payments?: PaymentItem[]; unchanged?: boolean; status: MpStatus }>(
        since === null ? '/api/payments' : `/api/payments?since=${since}`,
      );
      revisionRef.current = data.status.revision;
      applyMpStatus(data.status);
      if (data.payments) applyPayments(data.payments);
      setIsConnected(true);
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) setIsConnected(false);
    }
  }, [applyMpStatus, applyPayments]);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api<AppServerStatus>('/api/status');
      setServerStatus(data);
    } catch (err) {
      console.error('Error fetching status:', err);
    }
  }, []);

  const replacePayment = useCallback(
    (payment: PaymentItem) => {
      setPayments((prev) => {
        const next = prev.map((p) => (p.id === payment.id ? payment : p));
        waitingIdsRef.current = new Set(next.filter(needsApproval).map((p) => p.id));
        return next;
      });
      setNewIncomingPayment((current) => (current?.id === payment.id ? null : current));
    },
    [],
  );

  useEffect(() => {
    fetchStatus().then(fetchPayments);

    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(async () => {
        await fetchPayments();
        schedule();
      }, document.visibilityState === 'visible' ? POLL_VISIBLE_MS : POLL_HIDDEN_MS);
    };
    schedule();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchPayments();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchPayments, fetchStatus]);

  // Browsers only allow sound after the person touches the page once.
  useEffect(() => {
    const unlock = async () => {
      if (await soundNotifier.unlockMobileAudio()) {
        setIsSoundReady(true);
        window.removeEventListener('pointerdown', unlock);
      }
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // A phone at the counter must not go dark: with the screen off, no alert can show.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const keepAwake = async () => {
      if (document.visibilityState !== 'visible' || !navigator.wakeLock) return;
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // Not allowed here (low battery, old browser): the app keeps working.
      }
    };
    keepAwake();
    document.addEventListener('visibilitychange', keepAwake);
    return () => {
      document.removeEventListener('visibilitychange', keepAwake);
      lock?.release().catch(() => undefined);
    };
  }, []);

  // Back from Mercado Pago's authorization
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get('mp_linked') === 'true';
    const failure = params.get('mp_error');
    if (!linked && !failure) return;
    if (linked) {
      soundNotifier.playSaleAcceptedChime();
      showFeedback('¡Cuenta de Mercado Pago conectada!');
      fetchStatus();
    } else if (failure) {
      setMpLinkError(MP_ERRORS[failure] || 'No se pudo conectar Mercado Pago.');
      setIsMpLinkOpen(true);
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }, [fetchStatus, showFeedback]);

  const handleLogout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', body: {} });
    } finally {
      await onLogout();
    }
  };

  // Handler: Simulate Incoming Payment
  const handleSimulatePayment = async () => {
    try {
      setIsSimulating(true);
      await api('/api/payments/simulate', { method: 'POST', body: {} });
      await fetchPayments();
    } catch (err) {
      showFeedback(err instanceof ApiError ? err.message : 'No se pudo simular el pago.');
    } finally {
      setIsSimulating(false);
    }
  };

  /** A refused decision (for example, another cashier got there first) must be seen. */
  const decideSale = async (paymentId: string, body: Record<string, unknown>): Promise<PaymentItem | null> => {
    try {
      const data = await api<{ payment: PaymentItem }>(`/api/payments/${paymentId}/verify-sale`, {
        method: 'POST',
        body,
      });
      replacePayment(data.payment);
      return data.payment;
    } catch (err) {
      showFeedback(err instanceof ApiError ? err.message : 'No se pudo guardar la decisión.', 7000);
      const current = err instanceof ApiError ? err.data?.payment : null;
      if (current) replacePayment(current);
      setInstantApprovalPayment(null);
      return null;
    }
  };

  // Handler: Confirm sale directly from instant phone notification
  const handleConfirmInstantSale = async (payment: PaymentItem) => {
    await decideSale(payment.id, {
      status: 'accepted',
      saleTicketNumber: `TK-${Date.now().toString().slice(-6)}`,
      productOrConcept: payment.description || 'Cobro por Mostrador / Transferencia',
      internalNotes: 'Confirmado desde la pantalla de cobro rápido',
    });
  };

  // Handler: Reject sale from instant phone notification ("No es mi venta")
  const handleRejectInstantSale = async (payment: PaymentItem) => {
    await decideSale(payment.id, {
      status: 'rejected',
      internalNotes: 'No es mi venta - Descartado desde la pantalla de notificación',
    });
  };

  // Handler: Read payments directly from Mercado Pago
  const handleSyncMercadoPago = async () => {
    try {
      setIsSyncing(true);
      const data = await api<{ count: number }>('/api/mercadopago/sync', { method: 'POST', body: {} });
      showFeedback(data.count > 0 ? `Listo: ${data.count} pagos nuevos.` : 'Listo: no hay pagos nuevos.');
      await fetchPayments();
    } catch (err) {
      showFeedback(err instanceof ApiError ? err.message : 'No se pudo consultar Mercado Pago.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Handler: Accept Payment as Sale
  const handleConfirmAcceptSale = async (payload: VerifySalePayload) => {
    if (!selectedPaymentForAccept) return;
    const payment = await decideSale(selectedPaymentForAccept.id, {
      status: 'accepted',
      saleTicketNumber: payload.saleTicketNumber,
      productOrConcept: payload.productOrConcept,
      internalNotes: payload.internalNotes,
    });
    if (payment) {
      soundNotifier.playSaleAcceptedChime();
      setSelectedPaymentForReceipt(payment);
    }
  };

  // Handler: Reject / Discard Payment
  const handleRejectSale = async (payment: PaymentItem) => {
    await decideSale(payment.id, { status: 'rejected', internalNotes: 'Descartado como venta comercial' });
  };

  // Filtered Payments List
  const filteredPayments = useMemo(() => {
    let list = payments;

    // Filter by tab
    if (activeTab === 'pending') {
      list = list.filter(needsApproval);
    } else if (activeTab === 'accepted') {
      list = list.filter((p) => p.saleVerification.status === 'accepted');
    } else if (activeTab === 'rejected') {
      list = list.filter((p) => p.saleVerification.status === 'rejected');
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.payer.fullName.toLowerCase().includes(q) ||
          p.payer.email.toLowerCase().includes(q) ||
          (p.payer.identificationNumber && p.payer.identificationNumber.includes(q)) ||
          p.description.toLowerCase().includes(q) ||
          (p.saleVerification.saleTicketNumber &&
            p.saleVerification.saleTicketNumber.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [payments, activeTab, searchQuery]);

  const pendingCount = payments.filter(needsApproval).length;

  // Visible on the browser tab while working in another window.
  useEffect(() => {
    document.title = pendingCount > 0 ? `(${pendingCount}) Cobro por confirmar` : 'Corroborador de Pagos';
  }, [pendingCount]);

  const acceptedCount = payments.filter((p) => p.saleVerification.status === 'accepted').length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-sky-200">
      {/* Top Application Header */}
      <Header
        isConnected={isConnected}
        onSimulate={handleSimulatePayment}
        onSync={handleSyncMercadoPago}
        onOpenDeviceSync={() => setIsDeviceSyncOpen(true)}
        onOpenTeamShare={() => setIsTeamShareOpen(true)}
        onOpenMpLink={() => setIsMpLinkOpen(true)}
        onLogout={handleLogout}
        isSyncing={isSyncing}
        isSimulating={isSimulating}
        hasPending={pendingCount > 0}
        pendingCount={pendingCount}
        linkedAccount={serverStatus?.linkedAccount}
        isMpConfigured={serverStatus?.configured}
        needsReauth={serverStatus?.needsReauth}
        allowSimulation={allowSimulation}
        onOpenPendingApproval={() => {
          const pending = payments.find(needsApproval);
          if (pending) setInstantApprovalPayment(pending);
        }}
        isOwner={isOwner}
        userName={userName}
        businessName={session.businessName || ''}
      />

      {/* Sync feedback banner */}
      {syncFeedback && (
        <div className="bg-sky-900 text-sky-100 px-4 py-2 text-xs text-center border-b border-sky-800 animate-in fade-in">
          {syncFeedback}
        </div>
      )}

      {!isSoundReady && serverStatus?.configured && (
        <div id="sound-hint" className="bg-amber-400 text-slate-950 px-4 py-2 text-xs font-bold text-center">
          Tocá la pantalla una vez para activar el sonido de los cobros.
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 flex-1">
        {/* Statistics Bar */}
        <StatsBar payments={payments} />

        {/* Mercado Pago connection banner: says the truth about whether payments can arrive */}
        {serverStatus && !serverStatus.configured && (
          <div
            id="mp-connection-banner"
            className={`mb-6 border-2 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              serverStatus.needsReauth ? 'bg-rose-50 border-rose-300' : 'bg-sky-50 border-[#009ee3]/40'
            }`}
          >
            <div className="flex items-start gap-3">
              <AlertCircle className={`w-6 h-6 shrink-0 ${serverStatus.needsReauth ? 'text-rose-600' : 'text-[#009ee3]'}`} />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {serverStatus.needsReauth ? 'Mercado Pago se desconectó' : 'Falta conectar Mercado Pago'}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 max-w-2xl">
                  {isOwner
                    ? 'Hasta que la conectes no entran pagos a esta pantalla. Es un solo paso: autorizás desde tu cuenta de Mercado Pago.'
                    : 'Hasta que el dueño la conecte no entran pagos a esta pantalla. No confirmes ventas desde acá todavía.'}
                </p>
              </div>
            </div>
            {isOwner && (
              <button
                id="btn-open-mp-link-prompt"
                type="button"
                onClick={() => setIsMpLinkOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-[#009ee3] hover:bg-[#008bd4] text-white font-bold text-xs transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
              >
                <span>{serverStatus.needsReauth ? 'Volver a conectar' : 'Conectar Mercado Pago'}</span>
                <ExternalLink className="w-4 h-4 text-sky-100" />
              </button>
            )}
          </div>
        )}

        {/* Pending Sales Direct Approval Banner */}
        {pendingCount > 0 && (
          <div className="mb-6 bg-emerald-50 border-2 border-emerald-500/40 rounded-2xl p-4 sm:p-4.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#22c55e] text-slate-950 font-bold flex items-center justify-center shrink-0 shadow-xs">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-emerald-950">
                    {pendingCount === 1 ? '1 Transferencia / Pago por Aprobar' : `${pendingCount} Transferencias por Aprobar`}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 font-bold text-[10px]">
                    Atención Requerida
                  </span>
                </div>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Confirmá inmediatamente la venta desde la pantalla verde de caja para registrarla en tus comprobantes.
                </p>
              </div>
            </div>

            <button
              id="btn-open-instant-phone-banner"
              type="button"
              onClick={() => {
                const pending = payments.find(needsApproval);
                if (pending) setInstantApprovalPayment(pending);
              }}
              className="px-4 py-2.5 rounded-xl bg-[#14532d] hover:bg-[#0f4023] text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-2 shrink-0 cursor-pointer active:scale-98"
            >
              <Smartphone className="w-4 h-4 text-emerald-300" />
              <span>Abrir Notificación de Cobro</span>
            </button>
          </div>
        )}

        {/* Live receiver bar: only claims to be ready when a real account is connected */}
        {serverStatus?.configured && (
          <div className="mb-6 bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center shrink-0">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Recibiendo cobros de {serverStatus.linkedAccount?.nickname}</h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Cada cobro aprobado aparece acá con alerta sonora para que lo confirmes. Los datos se verifican directamente con Mercado Pago.
                </p>
              </div>
            </div>
            <div className="flex items-center flex-wrap gap-2 shrink-0">
              <button
                id="btn-banner-device-sync"
                type="button"
                onClick={() => setIsDeviceSyncOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-200" />
                <span>Abrir en otro dispositivo</span>
              </button>
            </div>
          </div>
        )}

        {allowSimulation && (
          <div className="mb-6">
            <button
              id="btn-quick-simulate"
              type="button"
              onClick={handleSimulatePayment}
              disabled={isSimulating}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-100 hover:bg-sky-200 text-sky-900 font-bold text-xs transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isSimulating ? 'Generando...' : 'Probar alerta con un pago simulado'}</span>
            </button>
          </div>
        )}

        {/* Tabs & Search Controls */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 sm:p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center flex-wrap gap-1.5" role="tablist">
              <button
                id="tab-all-payments"
                role="tab"
                aria-selected={activeTab === 'all'}
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Todos los Pagos ({payments.length})
              </button>

              <button
                id="tab-pending-payments"
                role="tab"
                aria-selected={activeTab === 'pending'}
                type="button"
                onClick={() => setActiveTab('pending')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'pending'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Pendientes de Corroborar</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'pending' ? 'bg-amber-700 text-white' : 'bg-amber-200 text-amber-900'
                  }`}
                >
                  {pendingCount}
                </span>
              </button>

              <button
                id="tab-accepted-payments"
                role="tab"
                aria-selected={activeTab === 'accepted'}
                type="button"
                onClick={() => setActiveTab('accepted')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'accepted'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Ventas Aceptadas ({acceptedCount})</span>
              </button>

              <button
                id="tab-rejected-payments"
                role="tab"
                aria-selected={activeTab === 'rejected'}
                type="button"
                onClick={() => setActiveTab('rejected')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  activeTab === 'rejected'
                    ? 'bg-rose-700 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Descartados
              </button>
            </div>

            {/* Search Input */}
            <div className="relative max-w-xs w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="input-search-payments"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por cliente, DNI, MP ID o Ticket..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500 text-slate-800 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Payments List */}
        {filteredPayments.length > 0 ? (
          <div className="space-y-3.5">
            {filteredPayments.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                onAcceptSale={(p) => setSelectedPaymentForAccept(p)}
                onViewReceipt={(p) => setSelectedPaymentForReceipt(p)}
                onRejectSale={(p) => handleRejectSale(p)}
                onOpenInstantApproval={(p) => setInstantApprovalPayment(p)}
              />
            ))}
          </div>
        ) : (
          <div
            id="empty-payments-state"
            className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs"
          >
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No hay pagos en esta vista</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {searchQuery
                ? 'No se encontraron operaciones con ese criterio de búsqueda.'
                : serverStatus?.configured
                  ? 'Cuando entre un cobro va a aparecer acá con alerta sonora.'
                  : 'Los cobros aparecen cuando la cuenta de Mercado Pago está conectada.'}
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 px-4 sm:px-6 text-center text-xs text-slate-500">
        <p>
          Sistema de Corroboración de Pagos
        </p>
      </footer>

      {/* Floating Live Alert Toast (Auto notification on fresh incoming payment) */}
      <LiveAlertToast
        payment={newIncomingPayment}
        onDismiss={() => setNewIncomingPayment(null)}
        onAcceptSale={(payment) => {
          setNewIncomingPayment(null);
          setSelectedPaymentForAccept(payment);
        }}
      />

      {/* Modal: Aceptar Pago como Venta */}
      <AcceptSaleModal
        payment={selectedPaymentForAccept}
        isOpen={Boolean(selectedPaymentForAccept)}
        onClose={() => setSelectedPaymentForAccept(null)}
        onConfirm={handleConfirmAcceptSale}
        defaultAcceptedBy={userName}
      />

      {/* Modal: Comprobante / Voucher Imprimible */}
      <ReceiptModal
        payment={selectedPaymentForReceipt}
        isOpen={Boolean(selectedPaymentForReceipt)}
        onClose={() => setSelectedPaymentForReceipt(null)}
      />

      {/* Modal: Aprobación Instantánea Tipo Celular (Notificación de cobro requerida) */}
      <InstantSaleApprovalModal
        payment={instantApprovalPayment}
        isOpen={Boolean(instantApprovalPayment)}
        onClose={() => setInstantApprovalPayment(null)}
        onConfirmSale={handleConfirmInstantSale}
        onRejectSale={handleRejectInstantSale}
        operatorName={userName}
      />

      {/* Modal: Invitar vendedores */}
      {isOwner && <TeamShareModal isOpen={isTeamShareOpen} onClose={() => setIsTeamShareOpen(false)} />}

      {/* Modal: Sincronización Multi-Dispositivo & QR para Celulares */}
      <CrossDeviceSyncModal
        isOpen={isDeviceSyncOpen}
        onClose={() => setIsDeviceSyncOpen(false)}
        appUrl={serverStatus?.appUrl || ''}
      />

      {/* Modal: Cuenta de Mercado Pago */}
      <MercadoPagoLinkModal
        isOpen={isMpLinkOpen}
        onClose={() => {
          setIsMpLinkOpen(false);
          setMpLinkError(null);
        }}
        status={serverStatus}
        isOwner={isOwner}
        initialError={mpLinkError}
        onRefreshStatus={fetchStatus}
        onSyncPayments={handleSyncMercadoPago}
      />
    </div>
  );
}

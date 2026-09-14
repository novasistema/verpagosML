import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  ShieldCheck,
  Smartphone,
  CreditCard,
  User,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { Header } from './components/Header';
import { StatsBar } from './components/StatsBar';
import { PaymentCard } from './components/PaymentCard';
import { LiveAlertToast } from './components/LiveAlertToast';
import { AcceptSaleModal } from './components/AcceptSaleModal';
import { ReceiptModal } from './components/ReceiptModal';
import { WebhookConfigModal } from './components/WebhookConfigModal';
import { InstantSaleApprovalModal } from './components/InstantSaleApprovalModal';
import { CrossDeviceSyncModal } from './components/CrossDeviceSyncModal';
import { MercadoPagoLinkModal } from './components/MercadoPagoLinkModal';
import { PaymentItem, AppServerStatus, VerifySalePayload } from './types';
import { soundNotifier } from './utils/audio';

export default function App() {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [serverStatus, setServerStatus] = useState<AppServerStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [selectedPaymentForAccept, setSelectedPaymentForAccept] = useState<PaymentItem | null>(null);
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState<PaymentItem | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeviceSyncOpen, setIsDeviceSyncOpen] = useState(false);
  const [isMpLinkOpen, setIsMpLinkOpen] = useState(false);
  const [connectedDevicesCount, setConnectedDevicesCount] = useState(1);
  const [isMobileAudioUnlocked, setIsMobileAudioUnlocked] = useState(false);

  // Instant full-screen phone approval modal (matches the reference photo)
  const [instantApprovalPayment, setInstantApprovalPayment] = useState<PaymentItem | null>(null);
  const [hasAutoPromptedOnLoad, setHasAutoPromptedOnLoad] = useState(false);

  // Real-time live toast alert for new incoming payment
  const [newIncomingPayment, setNewIncomingPayment] = useState<PaymentItem | null>(null);

  // Loading states
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Fetch payments from server
  const fetchPayments = useCallback(async () => {
    try {
      const res = await fetch('/api/payments');
      if (res.ok) {
        const data = await res.json();
        const items: PaymentItem[] = data.payments || [];
        setPayments(items);

        // Auto notification on entry: jump straight to approving pending payment
        if (!hasAutoPromptedOnLoad && items.length > 0) {
          const pending = items.find((p) => p.saleVerification.status === 'pending');
          if (pending) {
            setInstantApprovalPayment(pending);
            setHasAutoPromptedOnLoad(true);
            soundNotifier.playPaymentChime();
          }
        }
      }
    } catch (err) {
      console.error('Error fetching payments:', err);
    }
  }, [hasAutoPromptedOnLoad]);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
      }
    } catch (err) {
      console.error('Error fetching status:', err);
    }
  }, []);

  // Initialize and subscribe to SSE
  useEffect(() => {
    fetchPayments();
    fetchStatus();

    // Setup Server-Sent Events
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource('/api/events');

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.addEventListener('init:sync', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (typeof data.connectedDevices === 'number') {
            setConnectedDevicesCount(data.connectedDevices);
          }
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('devices:count', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (typeof data.connectedDevices === 'number') {
            setConnectedDevicesCount(data.connectedDevices);
          }
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('devices:ping', () => {
        soundNotifier.playPaymentChime();
      });

      eventSource.addEventListener('payment:created', (e: MessageEvent) => {
        try {
          const item: PaymentItem = JSON.parse(e.data);
          setPayments((prev) => {
            const exists = prev.some((p) => p.id === item.id);
            if (exists) return prev;
            return [item, ...prev];
          });

          // Play audio notification chime
          soundNotifier.playPaymentChime();

          // Immediately pop up the notification on screen to approve it (on all synced screens!)
          if (item.saleVerification?.status === 'pending') {
            setInstantApprovalPayment(item);
          }

          // Trigger live toast alert
          setNewIncomingPayment(item);

          fetchStatus();
        } catch (err) {
          console.error('Failed to parse SSE payment:created', err);
        }
      });

      eventSource.addEventListener('payment:updated', (e: MessageEvent) => {
        try {
          const item: PaymentItem = JSON.parse(e.data);
          setPayments((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, ...item } : p)),
          );
          fetchStatus();
        } catch (err) {
          console.error('Failed to parse SSE payment:updated', err);
        }
      });

      eventSource.addEventListener('payment:verified', (e: MessageEvent) => {
        try {
          const item: PaymentItem = JSON.parse(e.data);
          setPayments((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, ...item } : p)),
          );

          // If another device verified this sale, close the approval prompt automatically
          setInstantApprovalPayment((current) => {
            if (current && current.id === item.id) {
              return null;
            }
            return current;
          });

          soundNotifier.playSaleAcceptedChime();
          fetchStatus();
        } catch (err) {
          console.error('Failed to parse SSE payment:verified', err);
        }
      });

      eventSource.addEventListener('account:linked', () => {
        fetchStatus();
        fetchPayments();
        soundNotifier.playSaleAcceptedChime();
        setSyncFeedback('¡Cuenta de Mercado Pago vinculada exitosamente!');
        setTimeout(() => setSyncFeedback(null), 5000);
      });

      eventSource.addEventListener('account:unlinked', () => {
        fetchStatus();
        setSyncFeedback('Cuenta de Mercado Pago desvinculada.');
        setTimeout(() => setSyncFeedback(null), 4000);
      });

      eventSource.onerror = () => {
        setIsConnected(false);
      };
    } catch (err) {
      console.error('SSE initialization error:', err);
      setIsConnected(false);
    }

    // Mobile background/lock resume handler: Re-sync immediately when phone screen turns back on
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchPayments();
        fetchStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Resilient periodic sync for mobile networks and battery-saving modes
    const backupInterval = setInterval(() => {
      fetchPayments();
    }, 4000);

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(backupInterval);
    };
  }, [fetchPayments, fetchStatus]);

  // Handle return from OAuth redirect (?mp_linked=true)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mp_linked') === 'true') {
        soundNotifier.playSaleAcceptedChime();
        setSyncFeedback('¡Cuenta de Mercado Pago vinculada exitosamente!');
        setTimeout(() => setSyncFeedback(null), 5000);
        window.history.replaceState({}, document.title, window.location.pathname);
        fetchStatus();
        fetchPayments();
      }
    }
  }, [fetchStatus, fetchPayments]);

  // Handler: Simulate Incoming Payment
  const handleSimulatePayment = async () => {
    try {
      setIsSimulating(true);
      const res = await fetch('/api/payments/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        // The SSE will also broadcast, but optimistic update is instant
        setPayments((prev) => {
          if (prev.some((p) => p.id === data.payment.id)) return prev;
          return [data.payment, ...prev];
        });
        soundNotifier.playPaymentChime();
        setInstantApprovalPayment(data.payment);
        setNewIncomingPayment(data.payment);
        fetchStatus();
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  // Handler: Confirm sale directly from instant phone notification
  const handleConfirmInstantSale = async (payment: PaymentItem) => {
    try {
      const generatedTicket = `TK-${Date.now().toString().slice(-6)}`;
      const res = await fetch(`/api/payments/${payment.id}/verify-sale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'accepted',
          saleTicketNumber: generatedTicket,
          productOrConcept: payment.description || 'Cobro por Mostrador / Transferencia',
          acceptedBy: 'Dueño / Vendedor',
          internalNotes: 'Confirmado desde la pantalla de cobro rápido',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPayments((prev) =>
          prev.map((p) => (p.id === data.payment.id ? data.payment : p)),
        );
        fetchStatus();
      }
    } catch (err) {
      console.error('Error in handleConfirmInstantSale:', err);
    }
  };

  // Handler: Reject sale from instant phone notification ("No es mi venta")
  const handleRejectInstantSale = async (payment: PaymentItem) => {
    try {
      const res = await fetch(`/api/payments/${payment.id}/verify-sale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          acceptedBy: 'Dueño / Vendedor',
          internalNotes: 'No es mi venta - Descartado desde la pantalla de notificación',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPayments((prev) =>
          prev.map((p) => (p.id === data.payment.id ? data.payment : p)),
        );
        fetchStatus();
      }
    } catch (err) {
      console.error('Error in handleRejectInstantSale:', err);
    }
  };

  // Handler: Sync with official Mercado Pago API
  const handleSyncMercadoPago = async () => {
    try {
      setIsSyncing(true);
      setSyncFeedback(null);
      const res = await fetch('/api/mercadopago/sync', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setSyncFeedback(`Sincronización exitosa: ${data.count} nuevos pagos incorporados.`);
        fetchPayments();
        fetchStatus();
      } else {
        setSyncFeedback(data.error || 'Configure el Access Token en el menú de Webhooks.');
      }
    } catch (err) {
      setSyncFeedback('Error al conectar con la API de Mercado Pago.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 5000);
    }
  };

  // Handler: Accept Payment as Sale
  const handleConfirmAcceptSale = async (payload: VerifySalePayload) => {
    if (!selectedPaymentForAccept) return;
    try {
      const res = await fetch(`/api/payments/${selectedPaymentForAccept.id}/verify-sale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'accepted',
          saleTicketNumber: payload.saleTicketNumber,
          productOrConcept: payload.productOrConcept,
          acceptedBy: payload.acceptedBy,
          internalNotes: payload.internalNotes,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPayments((prev) =>
          prev.map((p) => (p.id === data.payment.id ? data.payment : p)),
        );
        soundNotifier.playSaleAcceptedChime();
        fetchStatus();
        // Also open receipt modal for immediate printing
        setSelectedPaymentForReceipt(data.payment);
      }
    } catch (err) {
      console.error('Error confirming sale:', err);
    }
  };

  // Handler: Reject / Discard Payment
  const handleRejectSale = async (payment: PaymentItem) => {
    try {
      const res = await fetch(`/api/payments/${payment.id}/verify-sale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          acceptedBy: 'Cajero',
          internalNotes: 'Descartado como venta comercial',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPayments((prev) =>
          prev.map((p) => (p.id === data.payment.id ? data.payment : p)),
        );
        fetchStatus();
      }
    } catch (err) {
      console.error('Error rejecting sale:', err);
    }
  };

  // Handler: Save Access Token
  const handleSaveToken = async (token: string) => {
    await fetch('/api/config/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: token }),
    });
    await fetchStatus();
  };

  // Filtered Payments List
  const filteredPayments = useMemo(() => {
    let list = payments;

    // Filter by tab
    if (activeTab === 'pending') {
      list = list.filter((p) => p.saleVerification.status === 'pending');
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

  const pendingCount = payments.filter((p) => p.saleVerification.status === 'pending').length;
  const acceptedCount = payments.filter((p) => p.saleVerification.status === 'accepted').length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-sky-200">
      {/* Top Application Header */}
      <Header
        isConnected={isConnected}
        onSimulate={handleSimulatePayment}
        onSync={handleSyncMercadoPago}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenDeviceSync={() => setIsDeviceSyncOpen(true)}
        onOpenMpLink={() => setIsMpLinkOpen(true)}
        isSyncing={isSyncing}
        isSimulating={isSimulating}
        hasPending={pendingCount > 0}
        pendingCount={pendingCount}
        connectedDevices={connectedDevicesCount}
        linkedAccount={serverStatus?.linkedAccount}
        isMpConfigured={serverStatus?.configured}
        onOpenPendingApproval={() => {
          const pending = payments.find((p) => p.saleVerification.status === 'pending');
          if (pending) setInstantApprovalPayment(pending);
        }}
      />

      {/* Sync feedback banner */}
      {syncFeedback && (
        <div className="bg-sky-900 text-sky-100 px-4 py-2 text-xs text-center border-b border-sky-800 animate-in fade-in">
          {syncFeedback}
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 flex-1">
        {/* Statistics Bar */}
        <StatsBar payments={payments} />

        {/* Mercado Pago Link Banner (if not yet linked) */}
        {!serverStatus?.configured && (
          <div className="mb-6 bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 border-2 border-[#009ee3]/40 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-[#009ee3] text-white font-black text-base flex items-center justify-center shrink-0 shadow-md">
                MP
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Vincular con tu cuenta de Mercado Pago
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-sky-200 text-sky-900 font-bold text-[10px]">
                    Requerido para cobros reales
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 max-w-2xl">
                  Abre tu Mercado Pago y autoriza la vinculación con 1 solo clic para corroborar transferencias bancarias, alias, CVU y cobros con QR en tiempo real en tu pantalla de caja.
                </p>
              </div>
            </div>

            <button
              id="btn-open-mp-link-prompt"
              type="button"
              onClick={() => setIsMpLinkOpen(true)}
              className="px-4.5 py-2.5 rounded-xl bg-[#009ee3] hover:bg-[#008bd4] text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 shrink-0 cursor-pointer active:scale-98"
            >
              <span>Abrir Mercado Pago y Vincular</span>
              <ExternalLink className="w-4 h-4 text-sky-100" />
            </button>
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
                const pending = payments.find((p) => p.saleVerification.status === 'pending');
                if (pending) setInstantApprovalPayment(pending);
              }}
              className="px-4 py-2.5 rounded-xl bg-[#14532d] hover:bg-[#0f4023] text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-2 shrink-0 cursor-pointer active:scale-98"
            >
              <Smartphone className="w-4 h-4 text-emerald-300" />
              <span>Abrir Notificación de Cobro</span>
            </button>
          </div>
        )}

        {/* Action / Webhook Ready Alert Bar */}
        <div className="mb-6 bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center shrink-0">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">Receptor de Pagos en Vivo Activo</h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Listo para Cobrar
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Cada vez que un cliente abone por Mercado Pago (QR, Tarjeta, Transferencia), aparecerá aquí instantáneamente con alerta sonora para que corrobore y acepte la venta.
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 shrink-0">
            <button
              id="btn-banner-link-mp"
              type="button"
              onClick={() => setIsMpLinkOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#009ee3] hover:bg-[#008bd4] text-white font-bold text-xs transition shadow-xs cursor-pointer active:scale-98"
            >
              <div className="w-4 h-4 rounded bg-white/20 flex items-center justify-center text-[10px] font-black">
                MP
              </div>
              <span>{serverStatus?.linkedAccount ? 'Cuenta MP' : 'Vincular Mercado Pago'}</span>
            </button>
            <button
              id="btn-banner-device-sync"
              type="button"
              onClick={() => setIsDeviceSyncOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-xs cursor-pointer active:scale-98"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-200" />
              <span>Ver en Celular (QR)</span>
            </button>
            <button
              id="btn-quick-simulate"
              type="button"
              onClick={handleSimulatePayment}
              disabled={isSimulating}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition shadow-sm cursor-pointer active:scale-98"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isSimulating ? 'Generando...' : 'Probar Alerta de Pago'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
            >
              <span>Ver Webhook URL</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        </div>

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
                : 'Cuando ingrese un pago a través del Webhook de Mercado Pago, aparecerá automáticamente aquí con alerta sonora.'}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleSimulatePayment}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Simular Pago Ahora</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 px-4 sm:px-6 text-center text-xs text-slate-500">
        <p>
          Sistema de Corroboración de Pagos • Integrado con Mercado Pago Webhooks & API en tiempo real
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
      />

      {/* Modal: Comprobante / Voucher Imprimible */}
      <ReceiptModal
        payment={selectedPaymentForReceipt}
        isOpen={Boolean(selectedPaymentForReceipt)}
        onClose={() => setSelectedPaymentForReceipt(null)}
      />

      {/* Modal: Configuración de Webhook & Credenciales */}
      <WebhookConfigModal
        status={serverStatus}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaveToken={handleSaveToken}
        onTestWebhook={handleSimulatePayment}
        onOpenMpLink={() => setIsMpLinkOpen(true)}
      />

      {/* Modal: Aprobación Instantánea Tipo Celular (Notificación de cobro requerida) */}
      <InstantSaleApprovalModal
        payment={instantApprovalPayment}
        isOpen={Boolean(instantApprovalPayment)}
        onClose={() => setInstantApprovalPayment(null)}
        onConfirmSale={handleConfirmInstantSale}
        onRejectSale={handleRejectInstantSale}
      />

      {/* Modal: Sincronización Multi-Dispositivo & QR para Celulares */}
      <CrossDeviceSyncModal
        isOpen={isDeviceSyncOpen}
        onClose={() => setIsDeviceSyncOpen(false)}
        appUrl={serverStatus?.appUrl || ''}
        connectedDevices={connectedDevicesCount}
        onSimulateTestPayment={handleSimulatePayment}
      />

      {/* Modal: Vincular con Mercado Pago (OAuth y Credenciales) */}
      <MercadoPagoLinkModal
        isOpen={isMpLinkOpen}
        onClose={() => setIsMpLinkOpen(false)}
        status={serverStatus}
        onRefreshStatus={fetchStatus}
        onSyncPayments={handleSyncMercadoPago}
      />
    </div>
  );
}

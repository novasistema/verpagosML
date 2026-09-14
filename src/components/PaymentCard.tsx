import {
  CheckCircle2,
  Clock,
  CreditCard,
  Smartphone,
  User,
  FileText,
  Printer,
  Calendar,
  AlertCircle,
  Sparkles,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import { PaymentItem } from '../types';

interface PaymentCardProps {
  key?: string;
  payment: PaymentItem;
  onAcceptSale: (payment: PaymentItem) => void;
  onViewReceipt: (payment: PaymentItem) => void;
  onRejectSale?: (payment: PaymentItem) => void;
  onOpenInstantApproval?: (payment: PaymentItem) => void;
}

export function PaymentCard({
  payment,
  onAcceptSale,
  onViewReceipt,
  onRejectSale,
  onOpenInstantApproval,
}: PaymentCardProps) {
  const isPending = payment.saleVerification.status === 'pending';
  const isAccepted = payment.saleVerification.status === 'accepted';
  const isRejected = payment.saleVerification.status === 'rejected';

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getMethodBadge = () => {
    const pm = payment.paymentMethodId.toLowerCase();
    if (pm.includes('visa')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <CreditCard className="w-3.5 h-3.5" />
          Visa {payment.cardLastFourDigits ? `(•••• ${payment.cardLastFourDigits})` : ''}
        </span>
      );
    }
    if (pm.includes('master')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <CreditCard className="w-3.5 h-3.5" />
          Mastercard {payment.cardLastFourDigits ? `(•••• ${payment.cardLastFourDigits})` : ''}
        </span>
      );
    }
    if (pm.includes('account') || pm.includes('dinero')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
          <Smartphone className="w-3.5 h-3.5" />
          Dinero en Cuenta MP
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        <CreditCard className="w-3.5 h-3.5" />
        {payment.paymentMethodId.toUpperCase()}
      </span>
    );
  };

  return (
    <div
      id={`payment-card-${payment.id}`}
      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
        isPending
          ? 'bg-white border-amber-300 shadow-sm ring-2 ring-amber-100/80 hover:border-amber-400'
          : isAccepted
          ? 'bg-white border-slate-200 shadow-xs hover:border-emerald-200'
          : 'bg-slate-50/70 border-slate-200 opacity-75'
      }`}
    >
      {/* Top status notification strip */}
      <div
        className={`px-4 sm:px-6 py-2.5 text-xs font-medium flex items-center justify-between border-b ${
          isPending
            ? 'bg-amber-500/10 border-amber-200 text-amber-900'
            : isAccepted
            ? 'bg-emerald-500/10 border-emerald-200 text-emerald-900'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}
      >
        <div className="flex items-center gap-2">
          {isPending ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="font-bold">⚠️ Pendiente de corroborar en caja</span>
            </>
          ) : isAccepted ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-bold text-emerald-800">
                ✅ Corroborado y Aceptado como Venta ({payment.saleVerification.saleTicketNumber})
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
              <span className="font-medium text-rose-700">Descartado / No reconocido como venta</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px]">
          <span>MP ID #{payment.id}</span>
        </div>
      </div>

      {/* Main card content */}
      <div className="p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          {/* Amount & Method */}
          <div>
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Monto Acreditado</span>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-baseline gap-2 mt-0.5">
              <span>{formatCurrency(payment.transactionAmount)}</span>
              <span className="text-xs font-normal text-slate-500">
                (Neto: {formatCurrency(payment.netReceivedAmount)})
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              {getMethodBadge()}
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(payment.dateApproved || payment.dateCreated)}
              </span>
            </div>
          </div>

          {/* Customer info card block */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 sm:min-w-[280px]">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              <User className="w-3.5 h-3.5 text-sky-600" />
              <span>Datos del Cliente / Pagador</span>
            </div>
            <div className="text-sm font-bold text-slate-900">{payment.payer.fullName}</div>
            <div className="text-xs text-slate-600 mt-1 flex flex-col gap-0.5 font-sans">
              {payment.payer.identificationNumber && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-400">{payment.payer.identificationType || 'DNI'}:</span>
                  <span className="font-mono font-medium text-slate-700">
                    {payment.payer.identificationNumber}
                  </span>
                </div>
              )}
              {payment.payer.email && (
                <div className="truncate text-slate-600" title={payment.payer.email}>
                  {payment.payer.email}
                </div>
              )}
              {payment.payer.phone && (
                <div className="text-slate-600 text-xs font-mono">{payment.payer.phone}</div>
              )}
            </div>
          </div>
        </div>

        {/* Concept & Notes description */}
        <div className="py-3.5 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-slate-400 font-medium">Concepto MP: </span>
            <span className="text-slate-800 font-medium">{payment.description || 'Sin concepto detallado'}</span>
          </div>

          {payment.source === 'webhook' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-3 h-3" /> Webhook Mercado Pago Oficial
            </span>
          )}
          {payment.source === 'simulation' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
              <Sparkles className="w-3 h-3" /> Simulación de prueba
            </span>
          )}
        </div>

        {/* If accepted, show internal sale verification information */}
        {isAccepted && payment.saleVerification && (
          <div className="mt-2 bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3 text-xs text-emerald-950 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-emerald-900">Comprobante de Venta:</span>
                <span className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300 font-semibold text-emerald-800">
                  {payment.saleVerification.saleTicketNumber}
                </span>
              </div>
              <div className="text-emerald-700">
                Registrado por: <span className="font-medium text-emerald-900">{payment.saleVerification.acceptedBy}</span>
              </div>
            </div>
            {payment.saleVerification.productOrConcept && (
              <div className="text-slate-700 pt-0.5">
                <span className="font-medium text-emerald-900">Detalle / Producto: </span>
                {payment.saleVerification.productOrConcept}
              </div>
            )}
            {payment.saleVerification.internalNotes && (
              <div className="text-slate-600 text-[11px] italic">
                "{payment.saleVerification.internalNotes}"
              </div>
            )}
          </div>
        )}

        {/* Action button row */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {isPending ? (
              <>
                {onOpenInstantApproval && (
                  <button
                    id={`btn-instant-phone-${payment.id}`}
                    type="button"
                    onClick={() => onOpenInstantApproval(payment)}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] active:scale-98 text-slate-950 font-bold text-sm shadow-xs transition-colors"
                  >
                    <Smartphone className="w-4 h-4 text-slate-950" />
                    <span>Aprobar en Pantalla Verde</span>
                  </button>
                )}
                <button
                  id={`btn-accept-sale-${payment.id}`}
                  type="button"
                  onClick={() => onAcceptSale(payment)}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-98 text-white font-semibold text-sm shadow-xs transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Asignar Factura / Ticket</span>
                </button>
              </>
            ) : (
              <button
                id={`btn-view-receipt-${payment.id}`}
                type="button"
                onClick={() => onViewReceipt(payment)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Ver / Imprimir Comprobante de Venta</span>
              </button>
            )}

            {isPending && onRejectSale && (
              <button
                id={`btn-reject-sale-${payment.id}`}
                type="button"
                onClick={() => onRejectSale(payment)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors"
              >
                Descartar
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              id={`btn-ticket-preview-${payment.id}`}
              type="button"
              onClick={() => onViewReceipt(payment)}
              className="text-xs text-sky-700 hover:text-sky-800 font-medium inline-flex items-center gap-1 hover:underline"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Ver Ticket de Cobro</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

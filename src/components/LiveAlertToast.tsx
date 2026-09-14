import { useEffect } from 'react';
import { Bell, CheckCircle2, ArrowRight, X, Sparkles } from 'lucide-react';
import { PaymentItem } from '../types';

interface LiveAlertToastProps {
  payment: PaymentItem | null;
  onDismiss: () => void;
  onAcceptSale: (payment: PaymentItem) => void;
}

export function LiveAlertToast({ payment, onDismiss, onAcceptSale }: LiveAlertToastProps) {
  useEffect(() => {
    if (!payment) return;
    // Auto dismiss after 15 seconds if not interacted
    const timer = setTimeout(() => {
      onDismiss();
    }, 15000);
    return () => clearTimeout(timer);
  }, [payment, onDismiss]);

  if (!payment) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div
      id="live-payment-toast"
      role="alert"
      className="fixed bottom-5 right-5 z-50 max-w-md w-full bg-slate-900 border-2 border-emerald-500 text-white rounded-2xl shadow-2xl p-4 sm:p-5 transition-all transform animate-in slide-in-from-bottom-5 duration-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-emerald-400">
          <span className="relative flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-bold uppercase tracking-wider">¡Nuevo Pago Acreditado en Mercado Pago!</span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
          aria-label="Cerrar notificación"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 flex items-baseline justify-between border-b border-slate-800 pb-3">
        <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {formatCurrency(payment.transactionAmount)}
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold">
          Acreditado Ahora
        </span>
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-xs">Cliente / Titular:</span>
          <span className="font-semibold text-slate-100">{payment.payer.fullName}</span>
        </div>
        {payment.payer.identificationNumber && (
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs">Documento:</span>
            <span className="text-slate-200 text-xs font-mono">
              {payment.payer.identificationType || 'DNI'} {payment.payer.identificationNumber}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-xs">Concepto / Medio:</span>
          <span className="text-slate-300 text-xs truncate max-w-[200px]">
            {payment.description || payment.paymentMethodId.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="mt-4 pt-2 flex items-center gap-2.5">
        <button
          id="btn-toast-accept-sale"
          type="button"
          onClick={() => onAcceptSale(payment)}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-md transition-transform active:scale-95"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Aceptar como Pago de Venta</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
        >
          Luego
        </button>
      </div>
    </div>
  );
}

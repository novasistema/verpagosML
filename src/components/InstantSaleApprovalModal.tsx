import { useEffect, useState } from 'react';
import { X, Check, ArrowRight, ShieldCheck, User, CreditCard } from 'lucide-react';
import { PaymentItem } from '../types';
import { soundNotifier } from '../utils/audio';

interface InstantSaleApprovalModalProps {
  payment: PaymentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmSale: (payment: PaymentItem) => Promise<void>;
  onRejectSale: (payment: PaymentItem) => Promise<void>;
}

export function InstantSaleApprovalModal({
  payment,
  isOpen,
  onClose,
  onConfirmSale,
  onRejectSale,
}: InstantSaleApprovalModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [justApproved, setJustApproved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setJustApproved(false);
      setIsProcessing(false);
    }
  }, [isOpen, payment]);

  if (!isOpen || !payment) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getFormattedTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleConfirm = async () => {
    try {
      setIsProcessing(true);
      await onConfirmSale(payment);
      setJustApproved(true);
      soundNotifier.playSaleAcceptedChime();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Error confirming sale:', err);
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    try {
      setIsProcessing(true);
      await onRejectSale(payment);
      onClose();
    } catch (err) {
      console.error('Error rejecting sale:', err);
      setIsProcessing(false);
    }
  };

  const payerDisplay = payment.payer.email || payment.payer.fullName || 'Cliente Mercado Pago';
  const paymentTime = getFormattedTime(payment.dateApproved || payment.dateCreated);

  return (
    <div
      id="modal-instant-approval-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      {/* Container styled faithfully to the user's mobile screen reference photo */}
      <div
        id="instant-phone-screen"
        className="relative w-full max-w-[380px] h-[680px] max-h-[92vh] rounded-[42px] border-[6px] border-slate-800 bg-[#22c55e] text-slate-950 shadow-2xl flex flex-col justify-between overflow-hidden ring-1 ring-white/20 select-none animate-in zoom-in-95 duration-200"
        style={{
          backgroundColor: '#27cc59',
        }}
      >
        {/* Dynamic Island / Top Phone Bezel */}
        <div className="pt-3 px-6 flex items-center justify-between z-10">
          <span className="text-xs font-bold text-slate-900 tracking-tight">
            {paymentTime}
          </span>
          <div className="w-20 h-5 bg-black rounded-full mx-auto" />
          <button
            id="btn-close-phone-modal"
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-black/20 hover:bg-black/30 active:scale-95 flex items-center justify-center text-slate-900 transition-colors"
            title="Cerrar notificación"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Central Content matching the reference photo */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center my-auto">
          {justApproved ? (
            <div className="animate-in zoom-in duration-200 flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-slate-900 text-white flex items-center justify-center mb-4 shadow-lg">
                <Check className="w-12 h-12 stroke-[3]" />
              </div>
              <h2 className="text-2xl font-black tracking-tight text-slate-950">
                ¡Venta Confirmada!
              </h2>
              <p className="text-sm font-semibold text-slate-800 mt-1">
                El pago quedó registrado y aceptado en caja.
              </p>
            </div>
          ) : (
            <>
              {/* Header text like reference */}
              <p className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                Transferencia encontrada
              </p>

              {/* Big prominent Amount */}
              <div className="my-3 text-5xl sm:text-6xl font-extrabold tracking-tight text-slate-950">
                {formatCurrency(payment.transactionAmount)}
              </div>

              {/* Payer info line: email · time */}
              <p className="text-xs sm:text-sm font-semibold text-slate-900 opacity-90 max-w-[280px] truncate">
                {payerDisplay} · {paymentTime}
              </p>

              {/* Additional customer detail if available */}
              {payment.payer.fullName && payment.payer.fullName !== payerDisplay && (
                <p className="text-xs font-medium text-slate-800 mt-1">
                  Titular: <span className="font-bold">{payment.payer.fullName}</span>
                </p>
              )}

              {payment.payer.identificationNumber && (
                <p className="text-[11px] font-mono text-slate-800 mt-0.5 opacity-80">
                  {payment.payer.identificationType || 'DNI'}: {payment.payer.identificationNumber}
                </p>
              )}

              {payment.description && (
                <div className="mt-3 px-3 py-1 rounded-full bg-black/10 text-[11px] font-semibold text-slate-900 max-w-[260px] truncate">
                  {payment.description}
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom Actions matching the reference photo */}
        <div className="p-6 pb-7 space-y-2.5 z-10">
          {/* Main Primary Button: Confirmar venta */}
          <button
            id="btn-phone-confirmar-venta"
            type="button"
            disabled={isProcessing || justApproved}
            onClick={handleConfirm}
            className="w-full py-4 rounded-2xl bg-[#14532d] hover:bg-[#0f4023] active:scale-[0.98] text-white font-bold text-base shadow-md transition duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isProcessing && !justApproved ? (
              <span>Confirmando...</span>
            ) : justApproved ? (
              <>
                <Check className="w-5 h-5 stroke-[2.5]" />
                <span>Venta Aceptada</span>
              </>
            ) : (
              <span>Confirmar venta</span>
            )}
          </button>

          {/* Secondary Button: No es mi venta */}
          <button
            id="btn-phone-no-es-mi-venta"
            type="button"
            disabled={isProcessing || justApproved}
            onClick={handleReject}
            className="w-full py-3.5 rounded-2xl bg-[#b91c1c] hover:bg-[#991b1b] active:scale-[0.98] text-white font-bold text-sm shadow-sm transition duration-150 flex items-center justify-center cursor-pointer disabled:opacity-60"
          >
            <span>No es mi venta</span>
          </button>
        </div>

        {/* Phone Home Bar Indicator */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1 bg-black/30 rounded-full" />
      </div>
    </div>
  );
}

import { Printer, X, ShieldCheck, CheckCircle2, User, CreditCard, Calendar } from 'lucide-react';
import { PaymentItem } from '../types';

interface ReceiptModalProps {
  payment: PaymentItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ReceiptModal({ payment, isOpen, onClose }: ReceiptModalProps) {
  if (!isOpen || !payment) return null;

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

  const handlePrint = () => {
    window.print();
  };

  const isAccepted = payment.saleVerification.status === 'accepted';

  return (
    <div
      id="modal-receipt-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div
        id="modal-receipt-content"
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 print:m-0 print:p-0 print:border-none print:shadow-none"
      >
        {/* Modal bar (hidden in print) */}
        <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Comprobante de Corroboración de Pago</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Ticket Receipt Area */}
        <div id="printable-voucher" className="p-6 text-slate-800 font-sans">
          {/* Top Logo & Header */}
          <div className="text-center border-b border-dashed border-slate-300 pb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mb-2">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-black tracking-tight text-slate-900 uppercase">
              COMPROBANTE DE VENTA
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Acreditación Verificada en Mercado Pago
            </p>
            <div className="mt-2 inline-block px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider">
              {isAccepted ? 'PAGO ACEPTADO COMO VENTA' : 'COBRO ACREDITADO'}
            </div>
          </div>

          {/* Amount Showcase */}
          <div className="my-5 text-center bg-slate-50 py-3.5 rounded-xl border border-slate-200">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Cobrado</div>
            <div className="text-3xl font-black text-slate-950 mt-0.5">
              {formatCurrency(payment.transactionAmount)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Operación ID: <span className="font-mono font-bold text-slate-700">{payment.id}</span>
            </div>
          </div>

          {/* Details Table */}
          <div className="space-y-2.5 text-xs border-b border-dashed border-slate-300 pb-4">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Fecha y Hora:</span>
              <span className="font-medium text-slate-800">
                {formatDate(payment.dateApproved || payment.dateCreated)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Medio de Pago:</span>
              <span className="font-semibold text-slate-800 uppercase">
                {payment.paymentMethodId} {payment.cardLastFourDigits ? `(•••• ${payment.cardLastFourDigits})` : ''}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Titular / Cliente:</span>
              <span className="font-bold text-slate-900">{payment.payer.fullName}</span>
            </div>
            {payment.payer.identificationNumber && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Documento:</span>
                <span className="font-mono font-medium text-slate-800">
                  {payment.payer.identificationType || 'DNI'} {payment.payer.identificationNumber}
                </span>
              </div>
            )}
            {payment.payer.email && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Email:</span>
                <span className="text-slate-700 truncate max-w-[200px]">{payment.payer.email}</span>
              </div>
            )}
          </div>

          {/* Internal Sale Confirmation info */}
          {isAccepted && payment.saleVerification && (
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-600 font-bold">N° Comprobante / Ticket:</span>
                <span className="font-mono font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-300">
                  {payment.saleVerification.saleTicketNumber}
                </span>
              </div>
              {payment.saleVerification.productOrConcept && (
                <div className="flex justify-between items-start gap-2">
                  <span className="text-slate-600">Detalle:</span>
                  <span className="font-medium text-slate-900 text-right">
                    {payment.saleVerification.productOrConcept}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Verificado por:</span>
                <span className="font-medium text-slate-800">{payment.saleVerification.acceptedBy}</span>
              </div>
            </div>
          )}

          {/* Footer Notes */}
          <div className="mt-4 text-center">
            <p className="text-[10px] text-slate-600">
              Corroborado electrónicamente en tiempo real mediante API de Mercado Pago.
            </p>
          </div>
        </div>

        {/* Modal Actions (hidden in print) */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-between print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            Cerrar
          </button>
          <button
            id="btn-print-voucher"
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir / Guardar Ticket</span>
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, type FormEvent } from 'react';
import { CheckCircle2, X, User, DollarSign, Receipt, Tag, FileText, Sparkles } from 'lucide-react';
import { PaymentItem, VerifySalePayload } from '../types';

interface AcceptSaleModalProps {
  payment: PaymentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: VerifySalePayload) => Promise<void>;
}

export function AcceptSaleModal({
  payment,
  isOpen,
  onClose,
  onConfirm,
}: AcceptSaleModalProps) {
  const [saleTicketNumber, setSaleTicketNumber] = useState('');
  const [productOrConcept, setProductOrConcept] = useState('');
  const [acceptedBy, setAcceptedBy] = useState('Caja Central');
  const [internalNotes, setInternalNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (payment) {
      // Generate a suggestion for ticket/invoice number
      const autoNum = `VTA-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
      setSaleTicketNumber(autoNum);
      setProductOrConcept(payment.description || 'Venta de mercadería');
      setInternalNotes('');
    }
  }, [payment]);

  if (!isOpen || !payment) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!saleTicketNumber.trim()) return;

    try {
      setIsSubmitting(true);
      await onConfirm({
        saleTicketNumber: saleTicketNumber.trim(),
        productOrConcept: productOrConcept.trim(),
        acceptedBy: acceptedBy.trim() || 'Cajero',
        internalNotes: internalNotes.trim(),
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="modal-accept-sale-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div
        id="modal-accept-sale-content"
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="bg-emerald-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/30 flex items-center justify-center text-white border border-emerald-400/30">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Aceptar como Pago de Venta</h3>
              <p className="text-xs text-emerald-100">Vincular cobro acreditado a comprobante interno</p>
            </div>
          </div>
          <button
            id="btn-close-accept-modal"
            type="button"
            onClick={onClose}
            className="text-emerald-100 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Payment Summary Box */}
        <div className="px-6 py-4 bg-emerald-50/50 border-b border-emerald-100 flex items-center justify-between">
          <div>
            <span className="text-xs text-emerald-800 font-semibold uppercase tracking-wider">
              Monto Acreditado en MP
            </span>
            <div className="text-2xl font-extrabold text-emerald-950">
              {formatCurrency(payment.transactionAmount)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Cliente / Pagador</div>
            <div className="text-sm font-bold text-slate-800">{payment.payer.fullName}</div>
            {payment.payer.identificationNumber && (
              <div className="text-xs text-slate-600 font-mono">
                {payment.payer.identificationType || 'DNI'}: {payment.payer.identificationNumber}
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label
              htmlFor="input-ticket-number"
              className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              N° de Factura, Ticket o Pedido Interno *
            </label>
            <div className="relative">
              <Receipt className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                id="input-ticket-number"
                type="text"
                required
                value={saleTicketNumber}
                onChange={(e) => setSaleTicketNumber(e.target.value)}
                placeholder="Ej: FAC-B-0001-000492 o Ticket #591"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono font-medium text-slate-800"
              />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Número con el cual se identifica la venta en tu sistema o talonario.
            </span>
          </div>

          <div>
            <label
              htmlFor="input-product-concept"
              className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Concepto / Productos Vendidos
            </label>
            <div className="relative">
              <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                id="input-product-concept"
                type="text"
                value={productOrConcept}
                onChange={(e) => setProductOrConcept(e.target.value)}
                placeholder="Ej: Zapatillas talle 42, 2x Remeras algodón"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="input-accepted-by"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                Cajero / Responsable
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  id="input-accepted-by"
                  type="text"
                  value={acceptedBy}
                  onChange={(e) => setAcceptedBy(e.target.value)}
                  placeholder="Ej: Caja 1 - Lucas"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-800"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="input-internal-notes"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                Notas Internas (Opcional)
              </label>
              <input
                id="input-internal-notes"
                type="text"
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Ej: Retira en sucursal"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-800"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              id="btn-cancel-accept"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancelar
            </button>
            <button
              id="btn-confirm-accept-sale"
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md transition active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Guardando...' : 'Confirmar y Aceptar Venta'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

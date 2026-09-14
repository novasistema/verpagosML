import { DollarSign, Clock, CheckCircle2, TrendingUp } from 'lucide-react';
import { PaymentItem } from '../types';

interface StatsBarProps {
  payments: PaymentItem[];
}

export function StatsBar({ payments }: StatsBarProps) {
  const today = new Date().toISOString().split('T')[0];

  const todayPayments = payments.filter((p) => p.dateCreated.startsWith(today));
  const todayApproved = todayPayments.filter((p) => p.status === 'approved');

  const todayTotalAmount = todayApproved.reduce((sum, p) => sum + p.transactionAmount, 0);

  const pendingVerification = payments.filter(
    (p) => p.status === 'approved' && p.saleVerification.status === 'pending',
  );

  const acceptedSales = payments.filter((p) => p.saleVerification.status === 'accepted');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <section aria-label="Métricas de cobros y corroboración" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      {/* Metric 1: Recaudado Hoy */}
      <div
        id="stat-card-recaudado"
        className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between"
      >
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Acreditado Hoy</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            {formatCurrency(todayTotalAmount)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {todayApproved.length} {todayApproved.length === 1 ? 'cobro' : 'cobros'} en la fecha
          </p>
        </div>
        <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
          <DollarSign className="w-6 h-6" />
        </div>
      </div>

      {/* Metric 2: Pendientes de Corroborar */}
      <div
        id="stat-card-pendientes"
        className={`rounded-xl border p-4 shadow-xs flex items-center justify-between transition-all ${
          pendingVerification.length > 0
            ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
            : 'bg-white border-slate-200/80'
        }`}
      >
        <div>
          <p className="text-xs font-medium text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
            Pendientes de Venta
            {pendingVerification.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            )}
          </p>
          <p
            className={`text-xl sm:text-2xl font-bold mt-1 ${
              pendingVerification.length > 0 ? 'text-amber-900 font-extrabold' : 'text-slate-900'
            }`}
          >
            {pendingVerification.length}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {pendingVerification.length > 0 ? 'Requieren corroborar' : 'Sin pagos pendientes'}
          </p>
        </div>
        <div
          className={`w-11 h-11 rounded-lg border flex items-center justify-center shrink-0 ${
            pendingVerification.length > 0
              ? 'bg-amber-100 text-amber-700 border-amber-200 animate-pulse'
              : 'bg-slate-50 text-slate-500 border-slate-100'
          }`}
        >
          <Clock className="w-6 h-6" />
        </div>
      </div>

      {/* Metric 3: Ventas Aceptadas */}
      <div
        id="stat-card-aceptadas"
        className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between"
      >
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ventas Aceptadas</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            {acceptedSales.length}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Con comprobante asociado</p>
        </div>
        <div className="w-11 h-11 rounded-lg bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-6 h-6" />
        </div>
      </div>

      {/* Metric 4: Tasa de Corroboración */}
      <div
        id="stat-card-total-registros"
        className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between"
      >
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Histórico</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            {payments.length}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Pagos procesados</p>
        </div>
        <div className="w-11 h-11 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
          <TrendingUp className="w-6 h-6" />
        </div>
      </div>
    </section>
  );
}

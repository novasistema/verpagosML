import { useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, LogOut, ShieldCheck, Store, X } from 'lucide-react';
import { api, ApiError } from '../api';
import { AppServerStatus } from '../types';

interface MercadoPagoLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: AppServerStatus | null;
  isOwner: boolean;
  initialError?: string | null;
  onRefreshStatus: () => Promise<void>;
  onSyncPayments: () => void;
}

export function MercadoPagoLinkModal({
  isOpen,
  onClose,
  status,
  isOwner,
  initialError,
  onRefreshStatus,
  onSyncPayments,
}: MercadoPagoLinkModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const account = status?.linkedAccount || null;
  const shownError = error || initialError;

  const connect = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { authUrl } = await api<{ authUrl: string }>('/api/auth/mercadopago/start', { method: 'POST', body: {} });
      if (window.self !== window.top) {
        // Inside a preview iframe, Mercado Pago's page can't load: use a new tab.
        window.open(authUrl, '_blank', 'noopener');
        setIsLoading(false);
      } else {
        window.location.href = authUrl;
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo abrir Mercado Pago.');
      setIsLoading(false);
    }
  };

  const unlink = async () => {
    setIsLoading(true);
    try {
      await api('/api/auth/mercadopago/unlink', { method: 'POST', body: {} });
      setConfirmingUnlink(false);
      await onRefreshStatus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo desconectar la cuenta.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      id="mp-link-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="mp-link-modal-content"
        role="dialog"
        aria-label="Conectar Mercado Pago"
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#009ee3] px-6 py-5 text-white flex items-center justify-between">
          <h2 className="text-lg font-bold">Cuenta de Mercado Pago</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {shownError && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{shownError}</span>
            </div>
          )}

          {account && (
            <div
              className={`rounded-2xl border p-4 space-y-2 ${
                status?.needsReauth ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Store className={`w-5 h-5 shrink-0 ${status?.needsReauth ? 'text-rose-700' : 'text-emerald-700'}`} />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">{account.nickname}</div>
                  {account.email && <div className="text-xs text-slate-600 truncate">{account.email}</div>}
                </div>
              </div>
              <div className={`text-xs font-semibold flex items-center gap-1.5 ${status?.needsReauth ? 'text-rose-800' : 'text-emerald-800'}`}>
                {status?.needsReauth ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {status?.needsReauth
                  ? 'Mercado Pago pide volver a autorizar. Hasta entonces no entran pagos nuevos.'
                  : 'Conectada. Los cobros de esta cuenta aparecen acá.'}
              </div>
            </div>
          )}

          {!isOwner && !account && (
            <p className="text-sm text-slate-600">El dueño del comercio todavía no conectó la cuenta de Mercado Pago.</p>
          )}
          {!isOwner && status?.needsReauth && (
            <p className="text-sm text-slate-600">Avisale al dueño para que la vuelva a conectar.</p>
          )}

          {isOwner && (!account || status?.needsReauth) && (
            <>
              {!account && (
                <div className="text-sm text-slate-700 space-y-2">
                  <p>Se abre Mercado Pago, entrás con la cuenta donde cobra el comercio y tocás <strong>Autorizar</strong>. No hace falta copiar claves.</p>
                  <p className="text-xs text-slate-500 flex items-start gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-600 mt-0.5" />
                    Tu contraseña de Mercado Pago no pasa por este sistema.
                  </p>
                </div>
              )}
              <button
                id="btn-connect-mercadopago"
                type="button"
                onClick={connect}
                disabled={isLoading || status?.oauthReady === false}
                className="w-full py-3.5 rounded-xl bg-[#009ee3] hover:bg-[#008bd4] text-white font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>{isLoading ? 'Abriendo...' : account ? 'Volver a conectar' : 'Conectar con Mercado Pago'}</span>
                <ExternalLink className="w-4 h-4" />
              </button>
              {status?.oauthReady === false && (
                <p className="text-xs text-rose-700">
                  La conexión no está habilitada en esta instalación: faltan las credenciales de la aplicación en el servidor.
                </p>
              )}
            </>
          )}

          {account && !status?.needsReauth && (
            <button
              type="button"
              onClick={() => {
                onSyncPayments();
                onClose();
              }}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer"
            >
              Buscar pagos ahora
            </button>
          )}

          {isOwner && account &&
            (confirmingUnlink ? (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                <p className="text-xs text-rose-900 font-semibold">¿Desconectar? Dejan de entrar los cobros nuevos en todas las cajas.</p>
                <div className="flex gap-2">
                  <button
                    id="btn-confirm-unlink"
                    type="button"
                    onClick={unlink}
                    disabled={isLoading}
                    className="flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Sí, desconectar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingUnlink(false)}
                    className="flex-1 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                id="btn-unlink-mp-account"
                type="button"
                onClick={() => setConfirmingUnlink(true)}
                className="w-full py-2 rounded-xl text-rose-700 hover:bg-rose-50 text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Desconectar cuenta
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

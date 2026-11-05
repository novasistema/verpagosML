import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AlertCircle, Check, Copy, MessageCircle, RefreshCw, Users, X } from 'lucide-react';
import { api, ApiError } from '../api';

interface TeamShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TeamShareModal({ isOpen, onClose }: TeamShareModalProps) {
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setConfirmingRotate(false);
    api<{ url: string }>('/api/team/invite')
      .then((data) => setUrl(data.url))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo obtener el enlace.'));
  }, [isOpen]);

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 260, margin: 1.5, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(''));
  }, [url]);

  if (!isOpen) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('No se pudo copiar. Seleccioná el enlace y copialo a mano.');
    }
  };

  const shareOnWhatsApp = () => {
    const message = `Este es tu acceso a la caja para ver los cobros de Mercado Pago:\n\n${url}\n\nEs personal: no lo compartas fuera del negocio.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  };

  const rotate = async () => {
    setIsLoading(true);
    try {
      const data = await api<{ url: string }>('/api/team/invite/rotate', { method: 'POST', body: {} });
      setUrl(data.url);
      setConfirmingRotate(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo generar el enlace nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      id="team-share-overlay"
      className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Invitar vendedores"
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-sky-400" />
            Invitar vendedores
          </h2>
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
          {error && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-sm text-slate-600">
            Con este enlace, cada vendedor entra con su nombre, ve los cobros y confirma ventas. No puede tocar la cuenta de Mercado Pago.
          </p>

          {qr && <img src={qr} alt="Código QR de acceso para vendedores" className="w-48 h-48 mx-auto rounded-xl border border-slate-200" />}

          <input
            id="input-seller-invite-url"
            readOnly
            value={url}
            aria-label="Enlace de acceso para vendedores"
            className="w-full text-xs font-mono bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-slate-700"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copy}
              disabled={!url}
              className="py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado' : 'Copiar enlace'}
            </button>
            <button
              type="button"
              onClick={shareOnWhatsApp}
              disabled={!url}
              className="py-2.5 rounded-xl bg-[#22c55e] hover:bg-[#16a34a] text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp
            </button>
          </div>

          {confirmingRotate ? (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
              <p className="text-xs text-amber-900 font-semibold">
                Se cierra la sesión de todos los vendedores y el enlace actual deja de servir.
              </p>
              <div className="flex gap-2">
                <button
                  id="btn-confirm-rotate"
                  type="button"
                  onClick={rotate}
                  disabled={isLoading}
                  className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer"
                >
                  Generar enlace nuevo
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRotate(false)}
                  className="flex-1 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              id="btn-rotate-invite"
              type="button"
              onClick={() => setConfirmingRotate(true)}
              className="w-full py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Se fue un empleado: cambiar enlace
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

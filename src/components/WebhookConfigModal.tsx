import { useState, type FormEvent } from 'react';
import {
  Settings,
  X,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Key,
  Radio,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { AppServerStatus } from '../types';

interface WebhookConfigModalProps {
  status: AppServerStatus | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveToken: (token: string) => Promise<void>;
  onTestWebhook: () => void;
  onOpenMpLink?: () => void;
}

export function WebhookConfigModal({
  status,
  isOpen,
  onClose,
  onSaveToken,
  onTestWebhook,
  onOpenMpLink,
}: WebhookConfigModalProps) {
  const [copied, setCopied] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  const currentWebhookUrl = status?.webhookUrl || (typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/mercadopago` : '');

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentWebhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleSaveTokenSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    try {
      setIsSaving(true);
      await onSaveToken(tokenInput.trim());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      setTokenInput('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      id="modal-webhook-config-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div
        id="modal-webhook-config-content"
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Vinculación con Mercado Pago</h3>
              <p className="text-xs text-slate-400">Configuración de Webhooks y Credenciales API</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {/* Section 1: Webhook URL */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-sky-600" />
                URL de Webhook (Notificaciones en Tiempo Real)
              </span>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                Endpoint Listo
              </span>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              Copia esta URL y pégala en el panel de Mercado Pago para que te notifique automáticamente cuando un cliente abone una venta.
            </p>

            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg p-1.5 pl-3">
              <input
                type="text"
                readOnly
                value={currentWebhookUrl}
                className="w-full text-xs font-mono text-slate-800 bg-transparent border-none focus:outline-hidden"
              />
              <button
                id="btn-copy-webhook-url"
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar URL</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Section 2: Instructions to configure in Mercado Pago Developers */}
          <div className="border border-slate-200 rounded-xl p-4">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-sky-600" />
              Guía de 3 pasos para activar en Mercado Pago
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-xs text-slate-600">
              <li>
                Ingresa al panel de{' '}
                <a
                  href="https://www.mercadopago.com.ar/developers/panel"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-600 hover:text-sky-700 font-semibold inline-flex items-center gap-0.5 underline"
                >
                  Mercado Pago Developers <ExternalLink className="w-3 h-3" />
                </a>{' '}
                con tu cuenta comercial.
              </li>
              <li>
                Ve a <span className="font-semibold text-slate-800">Tus Integraciones &gt; Webhooks</span> y haz clic en{' '}
                <span className="font-semibold text-slate-800">"Crear Notificación"</span> o "Configurar".
              </li>
              <li>
                Pega la URL de arriba y tilda el evento <span className="font-bold text-emerald-700">"Pagos" (payment)</span>.
                ¡Listo! Apenas un cliente pague por QR, tarjeta o transferencia, sonará la campana y se listará aquí.
              </li>
            </ol>
          </div>

          {/* Quick link button to Mercado Pago Linking Modal */}
          {onOpenMpLink && (
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h5 className="font-bold text-xs text-sky-950">
                  ¿Querés vincular abriendo directamente tu Mercado Pago?
                </h5>
                <p className="text-xs text-sky-800 mt-0.5">
                  Podés vincular mediante OAuth oficial o credenciales directas con 1 clic.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMpLink();
                }}
                className="px-3.5 py-2 rounded-xl bg-[#009ee3] hover:bg-[#008bd4] text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
              >
                <span>Abrir y Vincular MP</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Section 3: Mercado Pago Access Token */}
          <div className="border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-4 h-4 text-amber-600" />
                Access Token de Mercado Pago (Opcional para Sincronización)
              </span>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  status?.hasAccessToken
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {status?.hasAccessToken ? 'Token Configurado' : 'Sin Token'}
              </span>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              Permite corroborar pagos automáticamente desde la API oficial de Mercado Pago o buscar las últimas operaciones realizadas.
            </p>

            <form onSubmit={handleSaveTokenSubmit} className="space-y-2">
              <div className="flex gap-2">
                <input
                  id="input-mp-access-token"
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="APP_USR-... o TEST-..."
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-mono text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
                <button
                  id="btn-save-mp-token"
                  type="submit"
                  disabled={isSaving || !tokenInput.trim()}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
                >
                  {isSaving ? 'Guardando...' : 'Guardar Token'}
                </button>
              </div>
              {saveSuccess && (
                <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Token guardado correctamente.
                </p>
              )}
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onTestWebhook}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-700 underline"
          >
            Probar recepción de pago ahora
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

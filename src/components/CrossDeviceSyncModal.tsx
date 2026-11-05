import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Smartphone, Volume2, X } from 'lucide-react';
import { soundNotifier } from '../utils/audio';

interface CrossDeviceSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  appUrl: string;
}

export function CrossDeviceSyncModal({ isOpen, onClose, appUrl }: CrossDeviceSyncModalProps) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const url = appUrl || window.location.origin;

  useEffect(() => {
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
      // The link stays visible to copy by hand.
    }
  };

  const testSound = async () => {
    await soundNotifier.unlockMobileAudio();
    soundNotifier.playPaymentChime();
  };

  return (
    <div
      id="cross-device-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Abrir en otro dispositivo"
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            Abrir en otro dispositivo
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

        <div className="p-6 space-y-4 text-sm text-slate-600">
          <p>Escaneá el código con tu celular e ingresá con tu email y contraseña. Los vendedores entran con su propio enlace.</p>

          {qr && <img src={qr} alt="Código QR de la aplicación" className="w-48 h-48 mx-auto rounded-xl border border-slate-200" />}

          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              aria-label="Dirección de la aplicación"
              className="w-full text-xs font-mono bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-slate-700"
            />
            <button
              type="button"
              onClick={copy}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          <button
            id="btn-test-sound"
            type="button"
            onClick={testSound}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Volume2 className="w-4 h-4" />
            Probar el sonido de este dispositivo
          </button>

          <p className="text-xs text-slate-500">
            Los cobros se ven mientras la app está abierta. En el celular, dejala en primer plano y con el volumen alto: si la pantalla se apaga, el aviso aparece al volver a abrirla.
          </p>
        </div>
      </div>
    </div>
  );
}

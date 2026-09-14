import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Copy,
  Check,
  X,
  Radio,
  ExternalLink,
  Volume2,
  BellRing,
  Laptop,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { soundNotifier } from '../utils/audio';

interface CrossDeviceSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  appUrl: string;
  connectedDevices: number;
  onSimulateTestPayment: () => void;
}

export const CrossDeviceSyncModal: React.FC<CrossDeviceSyncModalProps> = ({
  isOpen,
  onClose,
  appUrl,
  connectedDevices,
  onSimulateTestPayment,
}) => {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [hasCopied, setHasCopied] = useState(false);
  const [isSendingPing, setIsSendingPing] = useState(false);
  const [pingSuccess, setPingSuccess] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(true);

  // Compute clean URL for mobile
  const targetUrl = appUrl || (typeof window !== 'undefined' ? window.location.href : '');

  // Generate QR Code on mount or url change
  useEffect(() => {
    if (!targetUrl) return;

    QRCode.toDataURL(
      targetUrl,
      {
        width: 280,
        margin: 1.5,
        color: {
          dark: '#090d16',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      },
      (err, url) => {
        if (!err && url) {
          setQrCodeDataUrl(url);
        }
      },
    );
  }, [targetUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleSendTestPing = async () => {
    try {
      setIsSendingPing(true);
      soundNotifier.playPaymentChime();
      const res = await fetch('/api/devices/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: 'Panel de Control' }),
      });
      if (res.ok) {
        setPingSuccess(true);
        setTimeout(() => setPingSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to send ping', err);
    } finally {
      setIsSendingPing(false);
    }
  };

  const handleEnableAudio = async () => {
    const success = await soundNotifier.unlockMobileAudio();
    soundNotifier.playPaymentChime();
    setIsAudioActive(success);
  };

  if (!isOpen) return null;

  return (
    <div
      id="cross-device-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="cross-device-modal-content"
        className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Sincronización en Tiempo Real
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/25 text-emerald-300 border border-emerald-500/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  En Vivo
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Accedé desde tu celular, tablet o computadora con sincronización bidireccional instantánea.
              </p>
            </div>
          </div>
          <button
            id="btn-close-device-modal"
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Active Devices Banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  Estado de Conexión
                </div>
                <div className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                  <span>{connectedDevices} {connectedDevices === 1 ? 'dispositivo conectado' : 'dispositivos conectados en simultáneo'}</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>
              </div>
            </div>

            <button
              id="btn-send-test-ping"
              type="button"
              onClick={handleSendTestPing}
              disabled={isSendingPing}
              className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 shrink-0 shadow-xs cursor-pointer active:scale-98"
            >
              <BellRing className="w-4 h-4 text-emerald-200" />
              <span>{pingSuccess ? '¡Sonando en todos!' : 'Probar Sonido en Pantallas'}</span>
            </button>
          </div>

          {/* QR Code and Quick Link section */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {/* QR Card */}
            <div className="md:col-span-5 flex flex-col items-center justify-center bg-slate-50 p-5 rounded-2xl border border-slate-200/80 text-center">
              <div className="bg-white p-2.5 rounded-2xl shadow-sm border border-slate-200">
                {qrCodeDataUrl ? (
                  <img
                    src={qrCodeDataUrl}
                    alt="Escanear para abrir en celular"
                    className="w-44 h-44 rounded-lg object-contain"
                  />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center text-xs text-slate-400">
                    Generando QR...
                  </div>
                )}
              </div>
              <div className="mt-3 text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                Escaneá con la cámara de tu celular
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Compatible con iPhone, Android y tablets
              </p>
            </div>

            {/* Direct Link and Instructions */}
            <div className="md:col-span-7 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Enlace Directo para Abrir en Cualquier Pantalla
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="input-device-direct-url"
                    type="text"
                    readOnly
                    value={targetUrl}
                    className="w-full text-xs font-mono bg-slate-100 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 select-all focus:outline-none"
                  />
                  <button
                    id="btn-copy-device-url"
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-98"
                  >
                    {hasCopied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* How real-time sync works */}
              <div className="space-y-2.5 text-xs text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  ¿Cómo funciona la sincronización en vivo?
                </div>
                <ul className="space-y-1.5 text-slate-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Alerta al instante:</strong> Cuando entra una transferencia o pago de Mercado Pago, la pantalla verde de cobro salta automáticamente en tu celular y en la computadora al mismo segundo.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Aprobación compartida:</strong> Si presionas <em>"Confirmar venta"</em> desde tu teléfono, la computadora del local queda actualizada inmediatamente como cobrada y aprobada.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Campanilla Sonora:</strong> Emite sonido de confirmación en cada dispositivo activo.
                    </span>
                  </li>
                </ul>
              </div>

              {/* Sound activator for mobile */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 text-amber-700" />
                  <div>
                    <div className="text-xs font-bold text-amber-950">Sonido de campanilla en celulares</div>
                    <div className="text-[11px] text-amber-800">Toca para autorizar el audio en Safari / Chrome</div>
                  </div>
                </div>
                <button
                  id="btn-enable-mobile-audio"
                  type="button"
                  onClick={handleEnableAudio}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition cursor-pointer"
                >
                  Activar Audio
                </button>
              </div>
            </div>
          </div>

          {/* Quick steps to add to mobile Home Screen as Native App */}
          <div className="border-t border-slate-200 pt-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5 text-slate-600" />
              Usar como Aplicación en tu Pantalla de Inicio (PWA)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="font-bold text-slate-800 mb-1">En iPhone (Safari):</div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  1. Abre el enlace en Safari.<br />
                  2. Toca el botón <strong>Compartir</strong> (icono cuadrado con flecha).<br />
                  3. Selecciona <strong>"Agregar a pantalla de inicio"</strong>.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="font-bold text-slate-800 mb-1">En Android (Chrome):</div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  1. Abre el enlace en Chrome.<br />
                  2. Toca los <strong>tres puntos (⋮)</strong> arriba a la derecha.<br />
                  3. Selecciona <strong>"Instalar aplicación"</strong> o "Agregar a la pantalla principal".
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            id="btn-simulate-from-modal"
            type="button"
            onClick={() => {
              onSimulateTestPayment();
              onClose();
            }}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Radio className="w-4 h-4 text-emerald-200" />
            <span>Simular Pago y Probar Notificación en Pantallas</span>
          </button>

          <button
            id="btn-close-device-modal-footer"
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition cursor-pointer"
          >
            Listo, Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

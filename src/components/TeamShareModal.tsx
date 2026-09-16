import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Users,
  Copy,
  Check,
  X,
  Radio,
  ExternalLink,
  Volume2,
  BellRing,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Share2,
  MessageCircle,
  Laptop,
  Store,
  Crown,
} from 'lucide-react';
import { soundNotifier } from '../utils/audio';

interface TeamShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  appUrl: string;
  connectedDevices: number;
  onSimulateTestPayment: () => void;
  currentRole: 'dueno' | 'vendedor';
  onChangeRole: (role: 'dueno' | 'vendedor') => void;
  sellerName: string;
  onChangeSellerName: (name: string) => void;
}

export const TeamShareModal: React.FC<TeamShareModalProps> = ({
  isOpen,
  onClose,
  appUrl,
  connectedDevices,
  onSimulateTestPayment,
  currentRole,
  onChangeRole,
  sellerName,
  onChangeSellerName,
}) => {
  const [activeTab, setActiveTab] = useState<'vendedor' | 'dueno' | 'devices'>('vendedor');
  const [vendedorQr, setVendedorQr] = useState<string>('');
  const [duenoQr, setDuenoQr] = useState<string>('');
  const [copiedVendedor, setCopiedVendedor] = useState(false);
  const [copiedDueno, setCopiedDueno] = useState(false);
  const [isSendingPing, setIsSendingPing] = useState(false);
  const [pingSuccess, setPingSuccess] = useState(false);
  const [localSellerInput, setLocalSellerInput] = useState(sellerName);

  // Compute clean base URL
  const baseUrl = (appUrl || (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '')).replace(/\/$/, '');

  const vendedorUrl = `${baseUrl}?rol=vendedor${localSellerInput ? `&vendedor=${encodeURIComponent(localSellerInput)}` : ''}`;
  const duenoUrl = `${baseUrl}?rol=dueno`;

  // Generate QR code for vendedor
  useEffect(() => {
    if (!vendedorUrl) return;
    QRCode.toDataURL(
      vendedorUrl,
      {
        width: 260,
        margin: 1.5,
        color: {
          dark: '#0369a1',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      },
      (err, url) => {
        if (!err && url) {
          setVendedorQr(url);
        }
      },
    );
  }, [vendedorUrl]);

  // Generate QR code for dueño
  useEffect(() => {
    if (!duenoUrl) return;
    QRCode.toDataURL(
      duenoUrl,
      {
        width: 260,
        margin: 1.5,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      },
      (err, url) => {
        if (!err && url) {
          setDuenoQr(url);
        }
      },
    );
  }, [duenoUrl]);

  const handleCopyVendedorLink = async () => {
    try {
      await navigator.clipboard.writeText(vendedorUrl);
      setCopiedVendedor(true);
      setTimeout(() => setCopiedVendedor(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleCopyDuenoLink = async () => {
    try {
      await navigator.clipboard.writeText(duenoUrl);
      setCopiedDueno(true);
      setTimeout(() => setCopiedDueno(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleWhatsAppVendedor = () => {
    const text = encodeURIComponent(
      `Hola! Te comparto el acceso al Corroborador de Pagos de Mercado Pago para el mostrador de ventas:\n\n${vendedorUrl}\n\nÁbrelo desde tu celular o computadora. Ya está conectado con la cuenta del negocio para avisarte cada cobro en vivo.`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleSendTestPing = async () => {
    try {
      setIsSendingPing(true);
      soundNotifier.playPaymentChime();
      const res = await fetch('/api/devices/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: 'Panel de Compartir' }),
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

  if (!isOpen) return null;

  return (
    <div
      id="team-share-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="team-share-modal-content"
        className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 shadow-inner">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Compartir con el Equipo (Dueño & Vendedores)
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Misma Cuenta Sincronizada
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Todos tus vendedores usan la misma cuenta de Mercado Pago en sus celulares o tablets sin necesidad de claves.
              </p>
            </div>
          </div>
          <button
            id="btn-close-team-modal"
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Role Selector Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('vendedor')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'vendedor'
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Acceso para Vendedores (Mostrador / Caja)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dueno')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'dueno'
                ? 'border-slate-800 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Crown className="w-4 h-4 text-amber-500" />
            <span>Acceso para Dueño / Socio</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('devices')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition flex items-center gap-2 cursor-pointer ml-auto ${
              activeTab === 'devices'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Radio className="w-4 h-4 text-emerald-500" />
            <span>En Vivo ({connectedDevices})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* TAB 1: VENDEDOR */}
          {activeTab === 'vendedor' && (
            <div className="space-y-6">
              {/* Information Banner */}
              <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-sky-950 uppercase tracking-wider">
                    Modo Mostrador Seguro para Empleados
                  </h4>
                  <p className="text-xs text-sky-800 mt-1 leading-relaxed">
                    Tus vendedores pueden corroborar si un cliente transfirió, ver montos, nombres de quien pagó y comprobantes.
                    <strong> Por seguridad, tus claves privadas y la opción de desvincular Mercado Pago quedan ocultas para ellos.</strong>
                  </p>
                </div>
              </div>

              {/* Custom cashier identifier */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Nombre del Vendedor o Caja (Opcional):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ej: Mostrador 1, Lucas, Caja Central..."
                    value={localSellerInput}
                    onChange={(e) => {
                      setLocalSellerInput(e.target.value);
                      onChangeSellerName(e.target.value);
                    }}
                    className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:border-sky-500 focus:outline-none"
                  />
                  {localSellerInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setLocalSellerInput('');
                        onChangeSellerName('');
                      }}
                      className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded-xl transition cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Este nombre aparecerá en los comprobantes de venta ("Verificado por: {localSellerInput || 'Vendedor'}").
                </p>
              </div>

              {/* QR and Direct Link Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                {/* QR Code */}
                <div className="md:col-span-5 flex flex-col items-center justify-center bg-sky-50/60 p-5 rounded-2xl border border-sky-100 text-center">
                  <div className="bg-white p-2.5 rounded-2xl shadow-sm border border-sky-200">
                    {vendedorQr ? (
                      <img
                        src={vendedorQr}
                        alt="Código QR para Vendedores"
                        className="w-44 h-44 rounded-lg object-contain"
                      />
                    ) : (
                      <div className="w-44 h-44 flex items-center justify-center text-xs text-slate-400">
                        Generando QR...
                      </div>
                    )}
                  </div>
                  <div className="mt-3 text-xs font-bold text-sky-900 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-sky-600" />
                    Escanear con el celular del vendedor
                  </div>
                  <p className="text-[11px] text-sky-700/80 mt-0.5">
                    Abre directo en Modo Vendedor
                  </p>
                </div>

                {/* Direct link & WhatsApp */}
                <div className="md:col-span-7 space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Enlace directo para el mostrador:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={vendedorUrl}
                        className="w-full text-xs font-mono bg-slate-100 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 select-all focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCopyVendedorLink}
                        className="px-3.5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-98 shadow-xs"
                      >
                        {copiedVendedor ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-200" />
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

                  <button
                    type="button"
                    onClick={handleWhatsAppVendedor}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Enviar acceso a Vendedor por WhatsApp</span>
                  </button>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 text-slate-600">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ¿Qué podrá hacer el vendedor?
                    </div>
                    <ul className="text-[11px] list-disc list-inside space-y-0.5 text-slate-600 pt-0.5">
                      <li>Escuchar la campanilla cuando el cliente envía el pago.</li>
                      <li>Ver al instante el nombre de quien transfirió y el importe exacto.</li>
                      <li>Aprobar la venta y emitir el ticket de despacho.</li>
                      <li>No requiere que le des ninguna contraseña de Mercado Pago.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DUEÑO */}
          {activeTab === 'dueno' && (
            <div className="space-y-6">
              <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-400 flex items-center justify-center shrink-0">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    Modo Dueño / Administrador
                  </h4>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Este acceso tiene permisos completos: permite ver el total recaudado del día, reportes de facturación, administrar las credenciales de Mercado Pago y configurar Webhooks.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-5 flex flex-col items-center justify-center bg-slate-50 p-5 rounded-2xl border border-slate-200 text-center">
                  <div className="bg-white p-2.5 rounded-2xl shadow-sm border border-slate-200">
                    {duenoQr ? (
                      <img
                        src={duenoQr}
                        alt="Código QR para Dueño"
                        className="w-44 h-44 rounded-lg object-contain"
                      />
                    ) : (
                      <div className="w-44 h-44 flex items-center justify-center text-xs text-slate-400">
                        Generando QR...
                      </div>
                    )}
                  </div>
                  <div className="mt-3 text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5 text-amber-500" />
                    Escanear para abrir como Dueño
                  </div>
                </div>

                <div className="md:col-span-7 space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Enlace administrativo para Dueño:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={duenoUrl}
                        className="w-full text-xs font-mono bg-slate-100 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 select-all focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCopyDuenoLink}
                        className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-98 shadow-xs"
                      >
                        {copiedDueno ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-300" />
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

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1 text-amber-900">
                    <div className="font-bold flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-amber-700" />
                      Consejo de Seguridad
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Comparte el enlace de la pestaña <strong>"Vendedores"</strong> con tus empleados. Guarda este enlace de Dueño solo para ti y tus socios de confianza.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DEVICES & LIVE SYNC */}
          {activeTab === 'devices' && (
            <div className="space-y-5">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Radio className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                      Dispositivos Activos en Simultáneo
                    </div>
                    <div className="text-base font-bold text-emerald-950 flex items-center gap-2">
                      <span>{connectedDevices} {connectedDevices === 1 ? 'dispositivo conectado' : 'dispositivos conectados'}</span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSendTestPing}
                  disabled={isSendingPing}
                  className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition flex items-center justify-center gap-2 shrink-0 shadow-xs cursor-pointer active:scale-98"
                >
                  <BellRing className="w-4 h-4 text-emerald-200" />
                  <span>{pingSuccess ? '¡Sonando en todos!' : 'Probar Campanilla en Pantallas'}</span>
                </button>
              </div>

              {/* Install PWA section */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Laptop className="w-4 h-4 text-slate-600" />
                  Cómo instalarlo como Aplicación en el celular del vendedor
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <div className="font-bold text-slate-800 mb-1">En Android (Chrome):</div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      1. Abre el enlace en Google Chrome.<br />
                      2. Toca los tres puntos (⋮) arriba a la derecha.<br />
                      3. Toca <strong>"Instalar aplicación"</strong> o "Agregar a pantalla principal".
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <div className="font-bold text-slate-800 mb-1">En iPhone (Safari):</div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      1. Abre el enlace en Safari.<br />
                      2. Toca el botón <strong>Compartir</strong> (cuadrado con flecha).<br />
                      3. Toca <strong>"Agregar a pantalla de inicio"</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Tu rol actual en esta pantalla:</span>
            <button
              type="button"
              onClick={() => onChangeRole(currentRole === 'dueno' ? 'vendedor' : 'dueno')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs border transition cursor-pointer flex items-center gap-1.5 ${
                currentRole === 'dueno'
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-sky-50 text-sky-900 border-sky-300 hover:bg-sky-100'
              }`}
            >
              {currentRole === 'dueno' ? (
                <>
                  <Crown className="w-3.5 h-3.5 text-amber-600" />
                  <span>Dueño (Admin)</span>
                </>
              ) : (
                <>
                  <Store className="w-3.5 h-3.5 text-sky-600" />
                  <span>Vendedor ({sellerName || 'Mostrador'})</span>
                </>
              )}
              <span className="text-[10px] font-normal underline ml-1">Cambiar</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                onSimulateTestPayment();
                onClose();
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Radio className="w-4 h-4 text-sky-200" />
              <span>Simular Pago de Prueba</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Key,
  Link2,
  LogOut,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Store,
  Mail,
  User,
  Check,
  Copy,
  Zap,
  ArrowRight,
  Info,
  Eye,
  EyeOff,
} from 'lucide-react';
import { AppServerStatus, LinkedMpAccount } from '../types';
import { soundNotifier } from '../utils/audio';

interface MercadoPagoLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: AppServerStatus | null;
  onRefreshStatus: () => Promise<void>;
  onSyncPayments: () => void;
}

export const MercadoPagoLinkModal: React.FC<MercadoPagoLinkModalProps> = ({
  isOpen,
  onClose,
  status,
  onRefreshStatus,
  onSyncPayments,
}) => {
  // Default to the ultra-simple "easy" tab!
  const [activeTab, setActiveTab] = useState<'easy' | 'oauth' | 'account'>('easy');
  const [clientId, setClientId] = useState(status?.clientId || '');
  const [clientSecret, setClientSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasCopiedRedirect, setHasCopiedRedirect] = useState(false);

  const linkedAccount: LinkedMpAccount | null = status?.linkedAccount || null;
  const isConfigured = Boolean(status?.configured || linkedAccount);

  const redirectUri = `${status?.appUrl || (typeof window !== 'undefined' ? window.location.origin : '')}/api/auth/mercadopago/callback`;

  // Synchronize client ID if server sends it
  useEffect(() => {
    if (status?.clientId && !clientId) {
      setClientId(status.clientId);
    }
  }, [status?.clientId, clientId]);

  // Set default tab to account if already linked, otherwise "easy"
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setSuccessMessage(null);
      if (linkedAccount) {
        setActiveTab('account');
      } else {
        setActiveTab('easy');
      }
    }
  }, [isOpen, linkedAccount]);

  // Listen for OAuth postMessage events from the popup window
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === 'MP_AUTH_SUCCESS') {
        setIsLoading(false);
        soundNotifier.playSaleAcceptedChime();
        setSuccessMessage('¡Cuenta de Mercado Pago vinculada exitosamente!');
        await onRefreshStatus();
        onSyncPayments();
        setActiveTab('account');
      } else if (event.data && event.data.type === 'MP_AUTH_ERROR') {
        setIsLoading(false);
        setErrorMessage(`Error al autorizar: ${event.data.error || 'Cancelado por el usuario'}`);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onRefreshStatus, onSyncPayments]);

  if (!isOpen) return null;

  // 1. Link with simple Access Token (Easy Mode)
  const handleLinkEasyToken = async (useDemo: boolean = false) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanToken = accessToken
      .trim()
      .replace(/^["'`\s]+/, '')
      .replace(/["'`\s]+$/, '')
      .trim();

    // Check if user accidentally pasted Application ID (digits only like 7719038881949496)
    if (!useDemo && /^\d+$/.test(cleanToken)) {
      setErrorMessage(
        '⚠️ Has pegado el "ID de aplicación" (números). El Access Token requerido está en la sección "Credenciales de producción" de tu cuenta de Mercado Pago y empieza con APP_USR-.'
      );
      return;
    }

    if (!useDemo && cleanToken.length < 15) {
      setErrorMessage(
        'Por favor ingresa un Access Token completo (comienza con APP_USR- o TEST- y tiene más de 30 caracteres).'
      );
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        accessToken: cleanToken,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        isDemo: useDemo,
      };

      let res: Response;
      try {
        res = await fetch('/api/auth/mercadopago/link-manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        // Fallback endpoint if browser or ad-blocker blocked the word 'mercadopago'
        res = await fetch('/api/link-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`El servidor devolvió una respuesta no válida (${res.status}).`);
      }

      if (!res.ok) {
        setErrorMessage(data.error || `Error (${res.status}) al validar el token de Mercado Pago.`);
        setIsLoading(false);
        return;
      }

      soundNotifier.playSaleAcceptedChime();
      setSuccessMessage('¡Conexión exitosa con Mercado Pago! Ya puedes corroborar cobros.');
      try {
        await onRefreshStatus();
        onSyncPayments();
      } catch {
        // Non-blocking
      }
      setActiveTab('account');
    } catch (err: any) {
      console.error('Error linking MP token:', err);
      const isFetchErr = err?.message?.toLowerCase().includes('fetch') || err?.name === 'TypeError';
      setErrorMessage(
        isFetchErr
          ? 'Error de conexión: No se pudo contactar al servidor local. Si usas bloqueador de anuncios (AdBlock/Brave Shields), desactívalo para este sitio.'
          : err?.message || 'Error de conexión al vincular Mercado Pago.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Launch OAuth Flow in popup
  const handleOpenMercadoPagoOAuth = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const targetClientId = clientId.trim() || status?.clientId || '';
    if (!targetClientId) {
      setErrorMessage('Ingresa el Número de Aplicación / Client ID de tu app en Mercado Pago.');
      return;
    }

    try {
      setIsLoading(true);

      if (clientSecret) {
        await fetch('/api/auth/mercadopago/save-app-credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: targetClientId,
            clientSecret: clientSecret.trim(),
          }),
        });
      }

      const res = await fetch(`/api/auth/mercadopago/url?client_id=${encodeURIComponent(targetClientId)}`);
      const data = await res.json();

      if (!res.ok || !data.authUrl) {
        setErrorMessage(data.error || 'No se pudo generar la URL de autorización de Mercado Pago.');
        setIsLoading(false);
        return;
      }

      const width = 600;
      const height = 750;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        data.authUrl,
        'MercadoPagoAuth',
        `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`,
      );

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.location.href = data.authUrl;
      } else {
        popup.focus();
      }
    } catch (err) {
      setErrorMessage('Error al conectar con Mercado Pago. Verifica tu conexión.');
      console.error(err);
      setIsLoading(false);
    }
  };

  // 3. Unlink account
  const handleUnlink = async () => {
    if (!confirm('¿Seguro que deseas desvincular tu cuenta de Mercado Pago?')) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/mercadopago/unlink', { method: 'POST' });
      if (res.ok) {
        await onRefreshStatus();
        setSuccessMessage('Cuenta desvinculada.');
        setActiveTab('easy');
      }
    } catch {
      setErrorMessage('No se pudo desvincular la cuenta.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setHasCopiedRedirect(true);
      setTimeout(() => setHasCopiedRedirect(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div
      id="mp-link-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="mp-link-modal-content"
        className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Official Mercado Pago Blue */}
        <div className="bg-gradient-to-r from-[#009ee3] via-[#0081ba] to-[#00608e] px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-xs border border-white/30 flex items-center justify-center text-white shadow-inner font-black text-xl shrink-0">
              MP
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Conectar Mercado Pago
                </h2>
                {isConfigured && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500 text-white shadow-xs">
                    <CheckCircle2 className="w-3 h-3" />
                    Conectado
                  </span>
                )}
              </div>
              <p className="text-xs text-sky-100 mt-0.5">
                Configuración rápida en 1 paso para corroborar pagos en vivo.
              </p>
            </div>
          </div>

          <button
            id="btn-close-mp-link-modal"
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('easy')}
            className={`pb-2.5 px-3 border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'easy'
                ? 'border-[#009ee3] text-[#009ee3] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Modo Fácil (Recomendado)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('oauth')}
            className={`pb-2.5 px-3 border-b-2 transition cursor-pointer ${
              activeTab === 'oauth'
                ? 'border-[#009ee3] text-[#009ee3] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Avanzado (OAuth / Client ID)
          </button>
          {linkedAccount && (
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className={`pb-2.5 px-3 border-b-2 transition cursor-pointer ${
                activeTab === 'account'
                  ? 'border-emerald-600 text-emerald-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Mi Cuenta Conectada
            </button>
          )}
        </div>

        {/* Feedback Messages */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[72vh] overflow-y-auto">
          {/* TAB: MODO FÁCIL (1 SOLO DATO: ACCESS TOKEN) */}
          {activeTab === 'easy' && (
            <div className="space-y-4">
              {/* Card Guía Paso a Paso Sencilla */}
              <div className="bg-sky-50/80 border border-sky-200 rounded-2xl p-4 text-xs text-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sky-950 flex items-center gap-1.5 text-sm">
                    <Zap className="w-4 h-4 text-amber-500 fill-amber-400" />
                    ¿Cómo conectar tu Mercado Pago en 1 minuto?
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-sky-200 text-sky-900 font-bold text-[10px]">
                    Sin complicaciones
                  </span>
                </div>

                <div className="space-y-2 text-slate-600">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#009ee3] text-white flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                      1
                    </span>
                    <p>
                      Haz clic en el botón azul para abrir tu panel de Mercado Pago.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#009ee3] text-white flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                      2
                    </span>
                    <p>
                      En el menú izquierdo, haz clic en <strong className="text-slate-900 bg-sky-100 px-1 py-0.5 rounded">Credenciales de producción</strong> (¡no en Detalles de la aplicación!).
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#009ee3] text-white flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                      3
                    </span>
                    <p>
                      Copia el campo <strong className="text-slate-900">Access Token</strong> (comienza con <code className="bg-white px-1 py-0.5 rounded border border-sky-300 font-mono text-sky-800">APP_USR-</code>) y pégalo abajo.
                    </p>
                  </div>
                </div>

                {/* Botón directo a Mercado Pago */}
                <div className="pt-1">
                  <a
                    href="https://www.mercadopago.com.ar/developers/panel/app"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl bg-white border border-[#009ee3] hover:bg-sky-50 text-[#009ee3] font-bold text-xs shadow-xs transition flex items-center justify-center gap-2"
                  >
                    <span>👉 Abrir mis Credenciales en Mercado Pago</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Input: Solo el Access Token */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800">
                    Pega aquí tu Access Token de Mercado Pago:
                  </label>
                  <span className="text-[11px] text-slate-400">1 único dato requerido</span>
                </div>
                <div className="relative">
                  <input
                    id="input-mp-access-token"
                    type={showToken ? 'text' : 'password'}
                    placeholder="APP_USR-0000000000000000-000000-..."
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-3 text-slate-900 focus:bg-white focus:border-[#009ee3] focus:outline-none pr-16"
                  />
                  <div className="absolute right-3 top-2.5 flex items-center gap-1.5 text-slate-400">
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      title={showToken ? 'Ocultar token' : 'Mostrar token para verificar'}
                      className="p-1 hover:text-slate-700 cursor-pointer rounded transition"
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <Key className="w-4 h-4" />
                  </div>
                </div>

                {/* Detección inteligente si pegó el ID de aplicación por error */}
                {accessToken.trim().length > 0 && /^\d+$/.test(accessToken.trim()) && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5 shadow-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-bold">⚠️ Has pegado el "ID de aplicación" ({accessToken.trim()}).</p>
                      <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                        El ID numérico no es la clave de acceso. Para obtener el <strong>Access Token</strong>: en el menú lateral izquierdo de tu app en Mercado Pago, haz clic en <strong>"Credenciales de producción"</strong>. Allí encontrarás el Access Token largo que empieza con <code>APP_USR-</code>.
                      </p>
                    </div>
                  </div>
                )}

                {/* Advertencia si no empieza con APP_USR ni TEST */}
                {accessToken.trim().length > 10 &&
                  !/^\d+$/.test(accessToken.trim()) &&
                  !accessToken.trim().startsWith('APP_USR-') &&
                  !accessToken.trim().startsWith('TEST-') && (
                    <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-[11px] flex items-center gap-2">
                      <Info className="w-4 h-4 shrink-0 text-sky-600" />
                      <span>Nota: En Mercado Pago, el Access Token de producción normalmente comienza con <strong>APP_USR-</strong>.</span>
                    </div>
                  )}

                <p className="text-[11px] text-slate-500">
                  No necesitas saber programar ni configurar servidores: al pegar la clave el sistema queda listo al instante.
                </p>
              </div>

              {/* Botones de Acción */}
              <div className="space-y-2 pt-2">
                <button
                  id="btn-verify-easy-token"
                  type="button"
                  onClick={() => handleLinkEasyToken(false)}
                  disabled={isLoading || !accessToken.trim()}
                  className="w-full py-3.5 px-5 rounded-xl bg-[#009ee3] hover:bg-[#008bd4] text-white font-bold text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 active:scale-98"
                >
                  <Link2 className="w-4 h-4" />
                  <span>{isLoading ? 'Verificando con Mercado Pago...' : 'Conectar y Comenzar a Corroborar'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="relative flex py-1 items-center">
                  <div className="grow border-t border-slate-200"></div>
                  <span className="shrink mx-3 text-slate-400 text-[11px]">o para probar el sistema ahora</span>
                  <div className="grow border-t border-slate-200"></div>
                </div>

                <button
                  id="btn-link-demo-account-easy"
                  type="button"
                  onClick={() => handleLinkEasyToken(true)}
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Activar Modo Prueba Demo (Sin Cuenta Ni Claves)</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB: AVANZADO (OAUTH / CLIENT ID) */}
          {activeTab === 'oauth' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-900 flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <p>
                  <strong>Nota para usuarios:</strong> Si solo quieres corroborar tus cobros en tu negocio, usa la solapa <strong>"Modo Fácil"</strong> que solo pide el Access Token. Esta pestaña avanzada es para autorizaciones multi-cuenta vía OAuth.
                </p>
              </div>

              {/* Botón OAuth */}
              <div className="p-4 bg-slate-50 border-2 border-dashed border-sky-300 rounded-2xl text-center space-y-3">
                <button
                  id="btn-open-mp-oauth-screen"
                  type="button"
                  onClick={handleOpenMercadoPagoOAuth}
                  disabled={isLoading}
                  className="w-full py-3.5 px-6 rounded-2xl bg-[#009ee3] hover:bg-[#008bd4] text-white font-bold text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
                >
                  <span>{isLoading ? 'Abriendo...' : 'Abrir Ventana de Autorización Mercado Pago'}</span>
                  <ExternalLink className="w-4 h-4" />
                </button>
                <p className="text-[11px] text-slate-500">
                  Requiere que hayas configurado tu Client ID y URL de redirección.
                </p>
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Número de aplicación / Client ID
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: 7719038881949496"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-[#009ee3]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Client Secret (Opcional)
                    </label>
                    <input
                      type="password"
                      placeholder="Ej: sec_0a1b2c3d..."
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-[#009ee3]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    URL de Redirección (Callback)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={redirectUri}
                      className="w-full text-xs font-mono bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-slate-700 select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={copyRedirectUri}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {hasCopiedRedirect ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{hasCopiedRedirect ? 'Copiada' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: CUENTA VINCULADA */}
          {activeTab === 'account' && linkedAccount && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-sm">
                      <Store className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                        Comercio Conectado
                      </div>
                      <div className="text-sm font-bold text-emerald-950">
                        {linkedAccount.nickname}
                      </div>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-200/80 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                    En Vivo
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white/70 backdrop-blur-xs p-3.5 rounded-xl border border-emerald-100">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Titular</span>
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{linkedAccount.firstName ? `${linkedAccount.firstName} ${linkedAccount.lastName || ''}` : 'Usuario Verificado'}</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Email</span>
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{linkedAccount.email}</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">ID Usuario MP</span>
                    <div className="font-mono text-slate-700">
                      {linkedAccount.id}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Estado</span>
                    <div className="font-semibold text-emerald-700">
                      Corroborando en tiempo real
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onSyncPayments();
                      onClose();
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <span>Sincronizar Pagos Ahora</span>
                  </button>

                  <button
                    id="btn-unlink-mp-account"
                    type="button"
                    onClick={handleUnlink}
                    disabled={isLoading}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Desvincular Cuenta</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Tus pagos y transferencias se corroboran de forma segura y en vivo.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

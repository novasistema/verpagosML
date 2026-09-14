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
  const [activeTab, setActiveTab] = useState<'oauth' | 'token' | 'account'>('oauth');
  const [clientId, setClientId] = useState(status?.clientId || '');
  const [clientSecret, setClientSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
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

  // Set default tab to account if already linked
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setSuccessMessage(null);
      if (linkedAccount) {
        setActiveTab('account');
      } else {
        setActiveTab('oauth');
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

  // 1. Launch OAuth Flow in popup / new window
  const handleOpenMercadoPagoOAuth = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const targetClientId = clientId.trim() || status?.clientId || '';
    if (!targetClientId) {
      setErrorMessage('Por favor ingresa el Client ID (App ID) de tu aplicación de Mercado Pago para abrir la autorización.');
      return;
    }

    try {
      setIsLoading(true);

      // Save credentials first if clientSecret provided
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

      // Fetch official auth URL
      const res = await fetch(`/api/auth/mercadopago/url?client_id=${encodeURIComponent(targetClientId)}`);
      const data = await res.json();

      if (!res.ok || !data.authUrl) {
        setErrorMessage(data.error || 'No se pudo generar la URL de autorización de Mercado Pago.');
        setIsLoading(false);
        return;
      }

      // Open Mercado Pago in popup
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
        // Pop-up blocked, redirect in current tab
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

  // 2. Link with direct Access Token
  const handleLinkManualToken = async (useDemo: boolean = false) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/mercadopago/link-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: accessToken.trim(),
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          isDemo: useDemo,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || 'Error al validar el token de Mercado Pago.');
        setIsLoading(false);
        return;
      }

      soundNotifier.playSaleAcceptedChime();
      setSuccessMessage('¡Cuenta de Mercado Pago vinculada correctamente!');
      await onRefreshStatus();
      onSyncPayments();
      setActiveTab('account');
    } catch {
      setErrorMessage('Error de conexión al vincular Mercado Pago.');
    } finally {
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
        setActiveTab('oauth');
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
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-xs border border-white/30 flex items-center justify-center text-white shadow-inner font-black text-xl">
              MP
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Vincular Mercado Pago
                </h2>
                {isConfigured && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500 text-white shadow-xs">
                    <CheckCircle2 className="w-3 h-3" />
                    Conectado
                  </span>
                )}
              </div>
              <p className="text-xs text-sky-100 mt-0.5">
                Recibe pagos acreditados y notificaciones en vivo de tus ventas.
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
            onClick={() => setActiveTab('oauth')}
            className={`pb-2.5 px-3 border-b-2 transition cursor-pointer ${
              activeTab === 'oauth'
                ? 'border-[#009ee3] text-[#009ee3] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Vincular con tu Cuenta (OAuth)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('token')}
            className={`pb-2.5 px-3 border-b-2 transition cursor-pointer ${
              activeTab === 'token'
                ? 'border-[#009ee3] text-[#009ee3] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Vincular con Token / Credenciales
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
              Cuenta Vinculada
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
          {/* TAB 1: OAUTH FLOW (Official Mercado Pago Login & Authorize) */}
          {activeTab === 'oauth' && (
            <div className="space-y-4">
              <div className="bg-sky-50 border border-sky-200/80 rounded-2xl p-4 text-xs text-sky-950">
                <div className="font-bold flex items-center gap-1.5 text-sky-900 mb-1">
                  <ShieldCheck className="w-4 h-4 text-[#009ee3]" />
                  Vinculación Oficial de Mercado Pago
                </div>
                <p className="leading-relaxed text-sky-800">
                  Al presionar el botón azul, se abrirá la ventana oficial de <strong>Mercado Pago</strong> para que inicies sesión en tu cuenta y autorices a esta aplicación a recibir tus ventas y pagos al instante.
                </p>
              </div>

              {/* Big Main Action Button: Open Mercado Pago */}
              <div className="p-4 bg-slate-50 border-2 border-dashed border-sky-300 rounded-2xl text-center space-y-3">
                <button
                  id="btn-open-mp-oauth-screen"
                  type="button"
                  onClick={handleOpenMercadoPagoOAuth}
                  disabled={isLoading}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#009ee3] to-[#007cb0] hover:from-[#008ed0] hover:to-[#006e9d] text-white font-bold text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-3 cursor-pointer active:scale-98 disabled:opacity-50"
                >
                  <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center text-xs font-black">
                    MP
                  </div>
                  <span>{isLoading ? 'Abriendo Mercado Pago...' : 'Abrir Mercado Pago y Vincular mi Cuenta'}</span>
                  <ExternalLink className="w-4 h-4 text-sky-200" />
                </button>

                <p className="text-[11px] text-slate-500">
                  Se abrirá una ventana segura de mercadopago.com.ar para autorizar la conexión.
                </p>
              </div>

              {/* App ID / Client ID Config Accordion */}
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    Configuración de tu Aplicación en Mercado Pago
                  </span>
                  <a
                    href="https://www.mercadopago.com.ar/developers/panel/app"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-[#009ee3] hover:underline font-semibold flex items-center gap-1"
                  >
                    <span>Panel de Desarrolladores MP</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Client ID / App ID
                    </label>
                    <input
                      id="input-mp-client-id"
                      type="text"
                      placeholder="Ej: 184920492810"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:border-[#009ee3] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Client Secret (Para intercambio automático)
                    </label>
                    <input
                      id="input-mp-client-secret"
                      type="password"
                      placeholder="Ej: sec_0a1b2c3d..."
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:border-[#009ee3] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    URL de Redirección (Configurar en Mercado Pago)
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

          {/* TAB 2: MANUAL TOKEN / CREDENTIALS LINK */}
          {activeTab === 'token' && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 space-y-2">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-[#009ee3]" />
                  Vincular con Access Token (Producción o Prueba)
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Puedes pegar tu <strong>Access Token</strong> directo (comienza con <code>APP_USR-</code> o <code>TEST-</code>) obtenido desde tus credenciales de Mercado Pago.
                </p>
                <a
                  href="https://www.mercadopago.com.ar/developers/panel/app"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#009ee3] hover:underline font-bold text-[11px]"
                >
                  <span>Abrir mis Credenciales en Mercado Pago</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Access Token de Mercado Pago
                </label>
                <input
                  id="input-mp-access-token"
                  type="password"
                  placeholder="APP_USR-0000000000000000-000000-..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 focus:bg-white focus:border-[#009ee3] focus:outline-none"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  id="btn-verify-manual-token"
                  type="button"
                  onClick={() => handleLinkManualToken(false)}
                  disabled={isLoading || !accessToken.trim()}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#009ee3] hover:bg-[#008ed0] text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Link2 className="w-4 h-4" />
                  <span>{isLoading ? 'Verificando...' : 'Verificar y Conectar Token'}</span>
                </button>

                <button
                  id="btn-link-demo-account"
                  type="button"
                  onClick={() => handleLinkManualToken(true)}
                  disabled={isLoading}
                  className="py-2.5 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Modo Prueba Demo</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: LINKED ACCOUNT DETAILS */}
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
                        Cuenta Conectada
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
                      <span>{linkedAccount.firstName ? `${linkedAccount.firstName} ${linkedAccount.lastName || ''}` : 'Usuario Oficial'}</span>
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
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Método</span>
                    <div className="font-medium text-slate-700 capitalize">
                      {linkedAccount.authMethod === 'oauth' ? 'OAuth Oficial' : linkedAccount.authMethod === 'token' ? 'Credencial Directa' : 'Simulación de Prueba'}
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
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>Los pagos acreditados se corroboran y aceptan en tiempo real.</span>
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

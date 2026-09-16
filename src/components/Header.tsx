import { useState } from 'react';
import {
  ShieldCheck,
  Radio,
  Volume2,
  VolumeX,
  RefreshCw,
  Settings,
  Sparkles,
  Smartphone,
  ExternalLink,
  Users,
  Crown,
  Store,
  ChevronDown,
  Lock,
} from 'lucide-react';
import { soundNotifier } from '../utils/audio';
import { LinkedMpAccount } from '../types';

interface HeaderProps {
  isConnected: boolean;
  onSimulate: () => void;
  onSync: () => void;
  onOpenSettings: () => void;
  onOpenDeviceSync: () => void;
  onOpenTeamShare: () => void;
  onOpenMpLink: () => void;
  isSyncing: boolean;
  isSimulating: boolean;
  hasPending?: boolean;
  pendingCount?: number;
  connectedDevices?: number;
  linkedAccount?: LinkedMpAccount | null;
  isMpConfigured?: boolean;
  onOpenPendingApproval?: () => void;
  currentRole: 'dueno' | 'vendedor';
  onChangeRole: (role: 'dueno' | 'vendedor') => void;
  sellerName: string;
  onChangeSellerName: (name: string) => void;
}

export function Header({
  isConnected,
  onSimulate,
  onSync,
  onOpenSettings,
  onOpenDeviceSync,
  onOpenTeamShare,
  onOpenMpLink,
  isSyncing,
  isSimulating,
  hasPending,
  pendingCount = 0,
  connectedDevices = 1,
  linkedAccount,
  isMpConfigured,
  onOpenPendingApproval,
  currentRole,
  onChangeRole,
  sellerName,
  onChangeSellerName,
}: HeaderProps) {
  const [soundEnabled, setSoundEnabled] = useState(soundNotifier.isSoundEnabled());
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempSellerName, setTempSellerName] = useState(sellerName);

  const toggleSound = () => {
    const next = !soundEnabled;
    soundNotifier.setSoundEnabled(next);
    setSoundEnabled(next);
    if (next) {
      soundNotifier.playSaleAcceptedChime();
    }
  };

  const handleSaveSellerName = () => {
    onChangeSellerName(tempSellerName.trim() || 'Vendedor Mostrador');
    setIsEditingName(false);
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand & Status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 shrink-0 shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Corroborador de Pagos
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Mercado Pago
                </span>
              </h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                {isConnected ? 'Escuchando en Tiempo Real' : 'Conectando servicio...'}
              </span>
              <span>•</span>
              <span className="text-slate-400">
                {currentRole === 'dueno' ? 'Panel de Dueño / Administrador' : `Caja Mostrador: ${sellerName || 'Vendedor'}`}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-2.5">
          {/* User Role Switcher Dropdown */}
          <div className="relative">
            <button
              id="btn-role-switcher"
              type="button"
              onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition shadow-xs cursor-pointer ${
                currentRole === 'dueno'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                  : 'bg-sky-500/15 text-sky-300 border-sky-500/30 hover:bg-sky-500/25'
              }`}
              title="Cambiar entre modo Dueño y modo Vendedor / Caja"
            >
              {currentRole === 'dueno' ? (
                <>
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  <span>Dueño</span>
                </>
              ) : (
                <>
                  <Store className="w-3.5 h-3.5 text-sky-400" />
                  <span className="max-w-[100px] truncate">{sellerName || 'Vendedor'}</span>
                </>
              )}
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {isRoleDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-64 rounded-2xl bg-white text-slate-900 shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-1.5 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Cambiar Perfil de Usuario
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onChangeRole('dueno');
                    setIsRoleDropdownOpen(false);
                  }}
                  className={`w-full px-3.5 py-2.5 text-left text-xs flex items-center justify-between hover:bg-amber-50 transition cursor-pointer ${
                    currentRole === 'dueno' ? 'font-bold bg-amber-50/70 text-amber-950' : 'text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-500" />
                    <div>
                      <div className="font-bold">Dueño / Administrador</div>
                      <div className="text-[10px] text-slate-500">Acceso total a reportes y configuración</div>
                    </div>
                  </div>
                  {currentRole === 'dueno' && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onChangeRole('vendedor');
                    setIsRoleDropdownOpen(false);
                  }}
                  className={`w-full px-3.5 py-2.5 text-left text-xs flex items-center justify-between hover:bg-sky-50 transition cursor-pointer ${
                    currentRole === 'vendedor' ? 'font-bold bg-sky-50/70 text-sky-950' : 'text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-sky-500" />
                    <div>
                      <div className="font-bold">Vendedor / Mostrador</div>
                      <div className="text-[10px] text-slate-500">Modo caja rápido, claves protegidas</div>
                    </div>
                  </div>
                  {currentRole === 'vendedor' && <span className="w-2 h-2 rounded-full bg-sky-500" />}
                </button>

                {currentRole === 'vendedor' && (
                  <div className="mt-1 pt-2 border-t border-slate-100 px-3.5 pb-1">
                    <div className="text-[11px] font-semibold text-slate-600 mb-1">Nombre en el mostrador:</div>
                    {isEditingName ? (
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={tempSellerName}
                          onChange={(e) => setTempSellerName(e.target.value)}
                          className="w-full text-xs px-2 py-1 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500"
                          placeholder="Tu nombre o caja"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveSellerName();
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleSaveSellerName}
                          className="px-2 py-1 bg-sky-600 text-white rounded-lg text-xs font-bold"
                        >
                          Guardar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{sellerName || 'Vendedor Mostrador'}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setTempSellerName(sellerName);
                            setIsEditingName(true);
                          }}
                          className="text-[11px] text-sky-600 hover:underline cursor-pointer font-medium"
                        >
                          Editar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Share with Team / Sellers button */}
          <button
            id="btn-header-share-team"
            type="button"
            onClick={onOpenTeamShare}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-sky-600 to-blue-700 text-white hover:from-sky-500 hover:to-blue-600 active:scale-98 transition shadow-xs cursor-pointer"
            title="Compartir con tus vendedores mediante QR o WhatsApp"
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Compartir con</span>
            <span>Vendedores</span>
          </button>

          {/* Mercado Pago Link / Account Button */}
          {linkedAccount || isMpConfigured ? (
            <button
              id="btn-header-linked-mercadopago"
              type="button"
              onClick={onOpenMpLink}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-sky-950/80 text-sky-200 border border-[#009ee3]/50 hover:bg-sky-900 active:scale-98 transition shadow-xs cursor-pointer"
              title={currentRole === 'vendedor' ? 'Mercado Pago activo y configurado por el dueño' : 'Cuenta vinculada - Clic para administrar'}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-sky-400">MP:</span>
              <span className="max-w-[120px] truncate text-white">
                {linkedAccount?.nickname || 'Conectado'}
              </span>
            </button>
          ) : (
            <button
              id="btn-header-link-mercadopago"
              type="button"
              onClick={onOpenMpLink}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold bg-[#009ee3] hover:bg-[#008bd4] text-white active:scale-98 transition shadow-md cursor-pointer animate-pulse"
              title="Vincular con tu cuenta de Mercado Pago"
            >
              <div className="w-4 h-4 rounded bg-white/20 flex items-center justify-center text-[10px] font-black">
                MP
              </div>
              <span>Vincular con Mercado Pago</span>
              <ExternalLink className="w-3 h-3 text-sky-100" />
            </button>
          )}

          {/* Pending Approval Quick Button (Green Phone Screen) */}
          {hasPending && onOpenPendingApproval && (
            <button
              id="btn-open-pending-phone"
              type="button"
              onClick={onOpenPendingApproval}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[#22c55e] text-slate-950 hover:bg-[#16a34a] active:scale-98 transition shadow-sm animate-pulse cursor-pointer"
              title="Abrir pantalla para confirmar pago de venta"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Aprobar Pago ({pendingCount})</span>
            </button>
          )}

          {/* Multi-device / Phone Sync Button */}
          <button
            id="btn-open-device-sync"
            type="button"
            onClick={onOpenDeviceSync}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900 active:scale-98 transition shadow-xs cursor-pointer"
            title="Conectar celular y ver en tiempo real en otros dispositivos"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="hidden sm:inline">En Vivo</span>
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
              {connectedDevices}
            </span>
          </button>

          {/* Sound Notification Toggle */}
          <button
            id="btn-toggle-sound"
            type="button"
            onClick={toggleSound}
            title={soundEnabled ? 'Silenciar alertas sonoras' : 'Activar campanilla de pagos'}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              soundEnabled
                ? 'bg-slate-800 text-emerald-400 border-emerald-500/30 hover:bg-slate-750'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden lg:inline">{soundEnabled ? 'Sonido Activo' : 'Silenciado'}</span>
          </button>

          {/* Sync Button */}
          <button
            id="btn-sync-mp"
            type="button"
            onClick={onSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-750 hover:border-slate-600 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-400' : ''}`} />
            <span className="hidden sm:inline">Sincronizar MP</span>
          </button>

          {/* Simulate Payment Button */}
          <button
            id="btn-simulate-payment"
            type="button"
            onClick={onSimulate}
            disabled={isSimulating}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-sky-300 border border-sky-500/30 active:scale-98 transition shadow-xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden xl:inline">Simular Cobro</span>
          </button>

          {/* Webhook & API Settings (Only shown to Dueño for security) */}
          {currentRole === 'dueno' && (
            <button
              id="btn-open-settings"
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition-colors cursor-pointer"
              title="Ajustes técnicos del dueño"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden md:inline">Ajustes</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}


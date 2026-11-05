import { useState } from 'react';
import {
  ShieldCheck,
  Radio,
  Volume2,
  VolumeX,
  RefreshCw,
  Sparkles,
  Smartphone,
  ExternalLink,
  Users,
  Crown,
  Store,
  LogOut,
} from 'lucide-react';
import { soundNotifier } from '../utils/audio';
import { LinkedMpAccount } from '../types';

interface HeaderProps {
  isConnected: boolean;
  onSimulate: () => void;
  onSync: () => void;
  onOpenDeviceSync: () => void;
  onOpenTeamShare: () => void;
  onOpenMpLink: () => void;
  onLogout: () => void;
  isSyncing: boolean;
  isSimulating: boolean;
  hasPending?: boolean;
  pendingCount?: number;
  linkedAccount?: LinkedMpAccount | null;
  isMpConfigured?: boolean;
  needsReauth?: boolean;
  allowSimulation?: boolean;
  onOpenPendingApproval?: () => void;
  isOwner: boolean;
  userName: string;
  businessName: string;
}

export function Header({
  isConnected,
  onSimulate,
  onSync,
  onOpenDeviceSync,
  onOpenTeamShare,
  onOpenMpLink,
  onLogout,
  isSyncing,
  isSimulating,
  hasPending,
  pendingCount = 0,
  linkedAccount,
  isMpConfigured,
  needsReauth,
  allowSimulation,
  onOpenPendingApproval,
  isOwner,
  userName,
  businessName,
}: HeaderProps) {
  const [soundEnabled, setSoundEnabled] = useState(soundNotifier.isSoundEnabled());

  const toggleSound = () => {
    const next = !soundEnabled;
    soundNotifier.setSoundEnabled(next);
    setSoundEnabled(next);
    if (next) {
      soundNotifier.playSaleAcceptedChime();
    }
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
                {isConnected ? 'En línea' : 'Reconectando...'}
              </span>
              <span>•</span>
              <span className="text-slate-400">
                {businessName}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-2.5">
          {/* Who is signed in */}
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border ${
              isOwner ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
            }`}
          >
            {isOwner ? <Crown className="w-3.5 h-3.5 text-amber-400" /> : <Store className="w-3.5 h-3.5 text-sky-400" />}
            <span className="max-w-[120px] truncate">{userName}</span>
          </div>

          {/* Share with Team / Sellers button */}
          {isOwner && (
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
          )}

          {/* Mercado Pago Link / Account Button */}
          {needsReauth ? (
            <button
              type="button"
              onClick={onOpenMpLink}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer"
            >
              <span>MP desconectado: reconectar</span>
            </button>
          ) : isMpConfigured ? (
            <button
              id="btn-header-linked-mercadopago"
              type="button"
              onClick={onOpenMpLink}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-sky-950/80 text-sky-200 border border-[#009ee3]/50 hover:bg-sky-900 active:scale-98 transition shadow-xs cursor-pointer"
              title={isOwner ? 'Cuenta conectada - Clic para administrar' : 'Mercado Pago conectado por el dueño'}
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
              <span>Conectar Mercado Pago</span>
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
            title="Abrir en otro dispositivo"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Otro dispositivo</span>
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
          {allowSimulation && isOwner && (
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
          )}

          <button
            id="btn-logout"
            type="button"
            onClick={onLogout}
            title="Cerrar sesión"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden md:inline">Salir</span>
          </button>
        </div>
      </div>
    </header>
  );
}


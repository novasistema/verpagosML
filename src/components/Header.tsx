import { useState } from 'react';
import {
  ShieldCheck,
  Radio,
  Volume2,
  VolumeX,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Smartphone,
  ExternalLink,
  Link2,
} from 'lucide-react';
import { soundNotifier } from '../utils/audio';
import { LinkedMpAccount } from '../types';

interface HeaderProps {
  isConnected: boolean;
  onSimulate: () => void;
  onSync: () => void;
  onOpenSettings: () => void;
  onOpenDeviceSync: () => void;
  onOpenMpLink: () => void;
  isSyncing: boolean;
  isSimulating: boolean;
  hasPending?: boolean;
  pendingCount?: number;
  connectedDevices?: number;
  linkedAccount?: LinkedMpAccount | null;
  isMpConfigured?: boolean;
  onOpenPendingApproval?: () => void;
}

export function Header({
  isConnected,
  onSimulate,
  onSync,
  onOpenSettings,
  onOpenDeviceSync,
  onOpenMpLink,
  isSyncing,
  isSimulating,
  hasPending,
  pendingCount = 0,
  connectedDevices = 1,
  linkedAccount,
  isMpConfigured,
  onOpenPendingApproval,
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
                {isConnected ? 'Escuchando en Tiempo Real' : 'Conectando servicio...'}
              </span>
              <span>•</span>
              <span className="text-slate-400">Verificación de ventas en caja</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-2.5">
          {/* Mercado Pago Link / Account Button */}
          {linkedAccount || isMpConfigured ? (
            <button
              id="btn-header-linked-mercadopago"
              type="button"
              onClick={onOpenMpLink}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-sky-950/80 text-sky-200 border border-[#009ee3]/50 hover:bg-sky-900 active:scale-98 transition shadow-xs cursor-pointer"
              title="Cuenta de Mercado Pago vinculada - Clic para ver detalles"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-sky-400">MP:</span>
              <span className="max-w-[130px] truncate text-white">
                {linkedAccount?.nickname || 'Vinculado'}
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
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[#22c55e] text-slate-950 hover:bg-[#16a34a] active:scale-98 transition shadow-sm animate-pulse"
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
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900 active:scale-98 transition shadow-xs"
            title="Conectar celular y ver en tiempo real en otros dispositivos"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Celular & En Vivo</span>
            <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
              {connectedDevices}
            </span>
          </button>

          {/* Sound Notification Toggle */}
          <button
            id="btn-toggle-sound"
            type="button"
            onClick={toggleSound}
            title={soundEnabled ? 'Silenciar alertas sonoras' : 'Activar campanilla de pagos'}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
              soundEnabled
                ? 'bg-slate-800 text-emerald-400 border-emerald-500/30 hover:bg-slate-750'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Sonido Activo' : 'Silenciado'}</span>
          </button>

          {/* Sync Button */}
          <button
            id="btn-sync-mp"
            type="button"
            onClick={onSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-750 hover:border-slate-600 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-400' : ''}`} />
            <span>Sincronizar MP</span>
          </button>

          {/* Simulate Payment Button */}
          <button
            id="btn-simulate-payment"
            type="button"
            onClick={onSimulate}
            disabled={isSimulating}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-400 hover:to-blue-500 active:scale-98 transition shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Simular Pago Entrante</span>
          </button>

          {/* Webhook & API Settings */}
          <button
            id="btn-open-settings"
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden md:inline">Webhook & Conexión</span>
          </button>
        </div>
      </div>
    </header>
  );
}

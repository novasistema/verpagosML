import { useState, type FormEvent } from 'react';
import { AlertCircle, ShieldCheck, Store } from 'lucide-react';
import { api, ApiError } from '../api';
import { SessionInfo } from '../types';

type Mode = 'login' | 'register' | 'seller';

interface AuthScreenProps {
  session: SessionInfo;
  inviteCode: string | null;
  onAuthenticated: () => Promise<void>;
}

const inputClass =
  'w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 focus:bg-white focus:border-sky-500 focus:outline-none';

export function AuthScreen({ session, inviteCode, onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>(inviteCode ? 'seller' : 'login');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      if (mode === 'login') {
        await api('/api/auth/login', { method: 'POST', body: { email, password } });
      } else if (mode === 'register') {
        await api('/api/auth/register', {
          method: 'POST',
          body: { businessName, email, password, registrationCode },
        });
      } else {
        await api('/api/auth/seller-login', { method: 'POST', body: { name: sellerName, code: inviteCode } });
      }
      await onAuthenticated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo ingresar. Probá de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const titles: Record<Mode, string> = {
    login: 'Ingresá a tu comercio',
    register: 'Creá la cuenta de tu comercio',
    seller: 'Ingresar a la caja',
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
              {mode === 'seller' ? <Store className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Corroborador de Pagos</p>
              <h1 className="text-lg font-bold text-slate-900">{titles[mode]}</h1>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="p-6 space-y-3.5">
          {error && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'seller' && (
            <label className="block text-xs font-bold text-slate-800">
              Tu nombre o el de tu caja
              <input
                id="input-seller-name"
                className={`${inputClass} mt-1`}
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                placeholder="Ej: Lucas - Caja 1"
                autoFocus
                required
              />
            </label>
          )}

          {mode === 'register' && (
            <label className="block text-xs font-bold text-slate-800">
              Nombre del comercio
              <input
                id="input-business-name"
                className={`${inputClass} mt-1`}
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                autoFocus
                required
              />
            </label>
          )}

          {mode !== 'seller' && (
            <>
              <label className="block text-xs font-bold text-slate-800">
                Email
                <input
                  id="input-email"
                  type="email"
                  autoComplete="email"
                  className={`${inputClass} mt-1`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="block text-xs font-bold text-slate-800">
                Contraseña
                <input
                  id="input-password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={mode === 'register' ? 8 : undefined}
                  className={`${inputClass} mt-1`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {mode === 'register' && <span className="block mt-1 font-normal text-slate-500">Mínimo 8 caracteres.</span>}
              </label>
            </>
          )}

          {mode === 'register' && session.registrationRequiresCode && (
            <label className="block text-xs font-bold text-slate-800">
              Código de activación
              <input
                id="input-registration-code"
                className={`${inputClass} mt-1`}
                value={registrationCode}
                onChange={(e) => setRegistrationCode(e.target.value)}
                required
              />
              <span className="block mt-1 font-normal text-slate-500">Te lo entrega tu proveedor del sistema.</span>
            </label>
          )}

          <button
            id="btn-auth-submit"
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm transition cursor-pointer disabled:opacity-50"
          >
            {isLoading ? 'Un momento...' : mode === 'register' ? 'Crear cuenta' : 'Ingresar'}
          </button>

          {mode !== 'seller' && (
            <button
              id="btn-auth-switch"
              type="button"
              onClick={() => {
                setError(null);
                setMode(mode === 'login' ? 'register' : 'login');
              }}
              className="w-full text-xs text-sky-700 hover:underline cursor-pointer"
            >
              {mode === 'login' ? '¿Comercio nuevo? Crear cuenta' : 'Ya tengo cuenta'}
            </button>
          )}
          {mode === 'login' && (
            <p className="text-[11px] text-slate-500 text-center">
              Si sos vendedor, entrá con el enlace que te pasó el dueño.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

/** Shown to the operator when the deployment is missing configuration. */
export function SetupRequired({ missing }: { missing: string[] }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-3">
        <h1 className="text-lg font-bold text-slate-900">Falta terminar la instalación</h1>
        <p className="text-sm text-slate-600">
          Quien administra el sistema debe cargar estas variables en el servidor:
        </p>
        <ul className="text-xs font-mono bg-slate-100 rounded-xl p-3 space-y-1 text-slate-800">
          {missing.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

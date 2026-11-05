/** Same-origin API client. The header marks the request as coming from the app itself. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly data: any = null,
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'corroborador',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor. Revisá internet y probá de nuevo.');
  }
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event('session-expired'));
    }
    throw new ApiError(res.status, data?.error || `Error del servidor (${res.status}).`, data);
  }
  return data as T;
}

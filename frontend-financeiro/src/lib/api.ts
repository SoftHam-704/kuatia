/* Cliente HTTP mínimo. Sem dependência nova: `fetch` já resolve.
   Toda falha vira `ApiError` com mensagem no idioma ativo, pronta para a tela —
   nenhuma tela precisa inventar texto de erro. */

import { t } from '../i18n/translate';

/* O backend roda em 3001 (PORT no .env da raiz). O padrão anterior apontava
   para 3000 e batia em porta vazia — ou, pior, no app de outro produto rodando
   na mesma máquina. Sobrescrever com VITE_API_URL ao publicar. */
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(t('No pudimos hablar con el servidor. Revisá la conexión e intentá de nuevo.'), 0);
  }

  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) {
    throw new ApiError(body?.message ?? t('La operación no se pudo completar.'), response.status);
  }
  return body as T;
}

export const apiGet = <T,>(path: string, token?: string | null) =>
  request<T>(path, { method: 'GET' }, token);

export const apiPost = <T,>(path: string, body: unknown, token?: string | null) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) }, token);

export const apiPut = <T,>(path: string, body: unknown, token?: string | null) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) }, token);

export async function apiDownload(path: string, filename: string, token?: string | null): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  } catch {
    throw new ApiError(t('No pudimos hablar con el servidor. Revisá la conexión e intentá de nuevo.'), 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new ApiError(body?.message ?? t('No se pudo preparar el archivo.'), response.status);
  }
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
}

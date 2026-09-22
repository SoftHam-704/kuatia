import { apiPost } from './api';

/* Sessão do usuário. O token é a fonte de verdade; o que a tela mostra
   (papel, tenant) é lido dele, nunca guardado em paralelo. */

const TOKEN_KEY = 'financeiro_token';
const EMPRESA_KEY = 'financeiro_empresa';

export type Role = 'ADMIN_TENANT' | 'OPERADOR';

export interface Session {
  token: string;
  tenantId: number;
  role: Role;
  /** Ficou no `localStorage` (dispositivo lembrado) e não no `sessionStorage`. */
  persistent: boolean;
}

interface TokenPayload {
  tenantId?: number;
  role?: string;
  exp?: number;
}

function decode(token: string): TokenPayload | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as TokenPayload;
  } catch {
    return null;
  }
}

function toSession(token: string, persistent: boolean): Session | null {
  const payload = decode(token);
  if (!payload?.tenantId || !payload.role) return null;
  if (payload.exp && payload.exp * 1000 <= Date.now()) return null;
  return { token, tenantId: payload.tenantId, role: payload.role as Role, persistent };
}

export function readSession(): Session | null {
  const persisted = localStorage.getItem(TOKEN_KEY);
  if (persisted) {
    const session = toSession(persisted, true);
    if (session) return session;
    localStorage.removeItem(TOKEN_KEY);
  }

  const temporary = sessionStorage.getItem(TOKEN_KEY);
  if (temporary) {
    const session = toSession(temporary, false);
    if (session) return session;
    sessionStorage.removeItem(TOKEN_KEY);
  }

  return null;
}

export function saveSession(token: string, remember: boolean): Session | null {
  const session = toSession(token, remember);
  if (!session) return null;
  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  return session;
}

/** Revoga no servidor e limpa o dispositivo. O logout local nunca falha. */
export async function signOut(token: string): Promise<void> {
  try {
    await apiPost('/auth/logout', {}, token);
  } catch {
    /* sessão já expirada no servidor — segue o baile */
  } finally {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

/** Empresa ativa: preferência do dispositivo, não estado do servidor. */
export function readActiveCompany(): number | null {
  const raw = localStorage.getItem(EMPRESA_KEY);
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function saveActiveCompany(empresaId: number): void {
  localStorage.setItem(EMPRESA_KEY, String(empresaId));
}

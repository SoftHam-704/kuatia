import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Pool } from 'pg';
import { resolveTenantRoute } from '../config/database.js';
import { assertMasterSession } from '../modules/auth/master-auth.service.js';

const payloadSchema = z.object({
  sid: z.string().uuid(),
  tenantId: z.number().int().positive(),
  tenantUserCode: z.number().int().positive(),
  financeUserId: z.number().int().positive(),
  role: z.enum(['ADMIN_TENANT', 'OPERADOR']),
});
const jwtSecret = process.env.JWT_SECRET ?? '';
if (!jwtSecret) throw new Error('JWT_SECRET es obligatoria.');

/** `schema` vem sempre do master, resolvido a cada requisição — nunca do token.
 *  Schema dentro do token não é autoridade de roteamento (invariante 2 do
 *  PADRAO-login-master-tenant). */
export interface AuthContext extends z.infer<typeof payloadSchema> { pool: Pool; schema: string }

declare global {
  namespace Express { interface Request { auth?: AuthContext } }
}

export async function authenticate(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const token = request.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('missing token');
    const payload = payloadSchema.parse(jwt.verify(token, jwtSecret));
    await assertMasterSession(payload.sid, payload.tenantId, payload.tenantUserCode);
    const route = await resolveTenantRoute(payload.tenantId);
    request.auth = { ...payload, pool: route.pool, schema: route.schema };
    next();
  } catch {
    response.status(401).json({ message: 'Sesión expirada o revocada.' });
  }
}

export function requireTenantAdmin(request: Request, response: Response, next: NextFunction): void {
  if (request.auth?.role !== 'ADMIN_TENANT') {
    response.status(403).json({ message: 'Esta acción requiere un administrador del grupo.' });
    return;
  }
  next();
}

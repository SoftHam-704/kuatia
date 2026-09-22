import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { assertMasterSession, authenticateInMaster, AuthenticationError, revokeMasterSession } from './master-auth.service.js';

const loginSchema = z.object({
  documento: z.string().min(1),
  nome: z.string().min(1),
  sobrenome: z.string().min(1),
  senha: z.string().min(1),
  lembrarDispositivo: z.boolean().optional(),
});

const tokenSchema = z.object({ sid: z.string().uuid(), tenantId: z.number().int().positive(), tenantUserCode: z.number().int().positive() });
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error('JWT_SECRET é obrigatória.');

const router = Router();

router.post('/login', async (request, response) => {
  try {
    const input = loginSchema.parse(request.body);
    const identity = await authenticateInMaster(input);
    const token = jwt.sign(
      { sid: identity.sessionId, tenantId: identity.masterEmpresaId, tenantUserCode: identity.tenantUserCode, financeUserId: identity.financeUserId, role: identity.role },
      jwtSecret,
      { expiresIn: '12h' },
    );
    response.status(200).json({
      token,
      user: { id: identity.financeUserId, role: identity.role },
      tenantId: identity.masterEmpresaId,
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof AuthenticationError) {
      response.status(401).json({ message: error.message === 'Credenciais inválidas.' ? error.message : 'Não foi possível autorizar este acesso.' });
      return;
    }
    console.error('Erro de autenticação financeira:', error);
    response.status(500).json({ message: 'Não foi possível processar o login.' });
  }
});

router.get('/verify', async (request, response) => {
  try {
    const token = request.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) throw new AuthenticationError('Sessão expirada ou revogada.');
    const payload = tokenSchema.parse(jwt.verify(token, jwtSecret));
    await assertMasterSession(payload.sid, payload.tenantId, payload.tenantUserCode);
    response.status(204).send();
  } catch {
    response.status(401).json({ message: 'Sessão expirada ou revogada.' });
  }
});

router.post('/logout', async (request, response) => {
  try {
    const token = request.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (token) {
      const payload = tokenSchema.parse(jwt.verify(token, jwtSecret));
      await revokeMasterSession(payload.sid);
    }
  } finally {
    response.status(204).send();
  }
});

export default router;

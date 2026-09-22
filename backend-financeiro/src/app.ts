import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { SUPPORTED_CURRENCIES, assertMonetaryAmount } from './domain/currency.js';
import authRouter from './modules/auth/auth.routes.js';
import payablesRouter from './modules/payables/payables.routes.js';
import companiesRouter from './modules/companies/companies.routes.js';
import costCentersRouter from './modules/cost-centers/cost-centers.routes.js';
import counterpartiesRouter from './modules/counterparties/counterparties.routes.js';
import cashRouter from './modules/cash/cash.routes.js';
import receivablesRouter from './modules/receivables/receivables.routes.js';
import reportsRouter from './modules/reports/reports.routes.js';
import panelRouter from './modules/panel/panel.routes.js';
import planRouter from './modules/plan/plan.routes.js';
import importsRouter from './modules/imports/imports.routes.js';
import exportsRouter from './modules/exports/exports.routes.js';
import usersRouter from './modules/users/users.routes.js';
import auditRouter from './modules/audit/audit.routes.js';

export const app = express();

/* Atrás de proxy, todo cliente chega com o IP do proxy — e aí o limitador de
   tentativas conta todo mundo junto: o primeiro a errar a senha bloqueia os
   outros. Confiar em UM salto é o suficiente e não deixa o cliente forjar
   X-Forwarded-For. */
app.set('trust proxy', 1);

app.use(helmet());

/* Allowlist de origem. `cors()` sem argumento libera qualquer site a chamar a
   API com o token da vítima em mãos. Sem CORS_ORIGINS configurado, a API só
   responde a mesma-origem — falha fechada, não aberta. */
const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Sem cabeçalho Origin = curl, healthcheck, app nativo. Não é navegador.
    if (!origin) return callback(null, true);
    return allowedOrigins.includes(origin)
      ? callback(null, true)
      : callback(new Error('Origen no autorizado.'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));

/* O login é o único ponto onde adivinhar compensa. bcrypt já custa ~100ms por
   tentativa; o limite transforma força bruta em algo inviável em vez de apenas
   lento. Conta por IP e por documento — quem gira o IP ainda esbarra no alvo. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  /* `ipKeyGenerator` normaliza IPv6 para o prefixo /64. Sem ele, quem tem IPv6
     troca de endereço dentro da própria faixa e ganha um balde novo a cada
     tentativa — o limite existiria só para IPv4. */
  keyGenerator: (request) => {
    const documento = typeof request.body?.documento === 'string' ? request.body.documento : '';
    return `${ipKeyGenerator(request.ip ?? '')}:${documento.replace(/[^0-9A-Za-z]/g, '').toUpperCase()}`;
  },
  message: { message: 'Demasiados intentos. Esperá unos minutos antes de probar de nuevo.' },
});

app.use('/api/v1/auth/login', loginLimiter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/cuentas-pagar', payablesRouter);
app.use('/api/v1/empresas', companiesRouter);
app.use('/api/v1/centros-costo', costCentersRouter);
app.use('/api/v1/contrapartes', counterpartiesRouter);
app.use('/api/v1/libro-caja', cashRouter);
app.use('/api/v1/cuentas-cobrar', receivablesRouter);
app.use('/api/v1/reportes', reportsRouter);
app.use('/api/v1/panel', panelRouter);
app.use('/api/v1/plan-cuentas', planRouter);
app.use('/api/v1/importaciones', importsRouter);
app.use('/api/v1/exportaciones', exportsRouter);
app.use('/api/v1/usuarios', usersRouter);
app.use('/api/v1/auditoria', auditRouter);

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/v1/config/currencies', (_request, response) => {
  response.json({ currencies: SUPPORTED_CURRENCIES });
});

app.post('/api/v1/validation/money', (request, response) => {
  const { value, currency } = request.body as { value?: string; currency?: typeof SUPPORTED_CURRENCIES[number] };
  if (!value || !currency || !SUPPORTED_CURRENCIES.includes(currency)) {
    return response.status(400).json({ message: 'Valor o moneda inválidos.' });
  }

  try {
    assertMonetaryAmount(value, currency);
    return response.status(204).send();
  } catch (error) {
    return response.status(400).json({ message: (error as Error).message });
  }
});

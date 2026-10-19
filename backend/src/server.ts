import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { env } from './config.js';
import { assetsRoutes } from './modules/assets.js';
import { auditRoutes } from './modules/audit.js';
import { authRoutes } from './modules/auth.js';
import { automationsRoutes } from './modules/automations.js';
import { jobsRoutes, startSweeper } from './modules/jobs.js';
import { queuesRoutes } from './modules/queues.js';
import { runnersRoutes } from './modules/runners.js';
import { schedulesRoutes } from './modules/schedules.js';
import { workspaceRoutes } from './modules/workspaces.js';

const app = Fastify({ logger: true });

await app.register(helmet);
await app.register(cors, { origin: env.FRONTEND_ORIGIN, credentials: true });
await app.register(cookie);
await app.register(jwt, { secret: env.JWT_SECRET, cookie: { cookieName: 'session', signed: false } });
await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
app.decorateRequest('wid', '');
// Upload do pacote: o .zip chega como corpo binário (application/zip), sem biblioteca extra de multipart.
app.addContentTypeParser(['application/zip', 'application/octet-stream'], { parseAs: 'buffer', bodyLimit: env.MAX_PACKAGE_MB * 1024 * 1024 }, (_req, body, done) => done(null, body));

app.setErrorHandler((err: unknown, req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ error: 'Dados inválidos.', details: err.issues });
  const e = err as { statusCode?: number; message?: string };
  if (e.statusCode === 413) return reply.code(413).send({ error: `Arquivo grande demais (máximo ${env.MAX_PACKAGE_MB} MB).` });
  if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: e.message ?? 'Requisição inválida.' });
  req.log.error(err);
  return reply.code(500).send({ error: 'Erro interno.' });
});

await app.register(async (api) => {
  for (const r of [authRoutes, workspaceRoutes, runnersRoutes, automationsRoutes, assetsRoutes, queuesRoutes, jobsRoutes, schedulesRoutes, auditRoutes]) await api.register(r);
}, { prefix: '/api' });

app.get('/health', async () => ({ ok: true }));
startSweeper();
await app.listen({ port: env.PORT, host: '0.0.0.0' });

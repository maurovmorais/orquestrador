import argon2 from 'argon2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config.js';
import { prisma } from '../db.js';
import { auth } from '../lib/context.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) });

  app.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, password } = body.parse(req.body);
    const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { org: true } });
    const invalido = () => reply.code(401).send({ error: 'Usuário ou senha inválidos.' });
    if (!u || !u.active) return invalido();
    if (u.lockedUntil && u.lockedUntil > new Date()) return reply.code(423).send({ error: 'Conta bloqueada temporariamente. Tente mais tarde.' });
    if (!(await argon2.verify(u.passwordHash, password))) {
      const falhas = u.failedLogins + 1;
      await prisma.user.update({ where: { id: u.id }, data: { failedLogins: falhas, lockedUntil: falhas >= 5 ? new Date(Date.now() + 15 * 60_000) : null } });
      return invalido();
    }
    await prisma.user.update({ where: { id: u.id }, data: { failedLogins: 0, lockedUntil: null } });
    const token = app.jwt.sign({ sub: u.id, orgId: u.orgId }, { expiresIn: '8h' });
    reply.setCookie('session', token, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/', maxAge: 8 * 3600 });
    return { id: u.id, email: u.email, cliente: u.org.name }; // "cliente" aparece no menu, perto do botão Sair
  });

  app.post('/auth/logout', async (_req, reply) => { reply.clearCookie('session', { path: '/' }); return { ok: true }; });

  app.get('/auth/me', { preHandler: auth }, async (req) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user.sub }, include: { org: true } });
    return { id: u.id, email: u.email, cliente: u.org.name };
  });
};

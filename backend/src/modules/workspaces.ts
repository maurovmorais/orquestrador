import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit, auth } from '../lib/context.js';

/** Ambientes (front-end: tela Ambientes e seletor do topo). */
export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', auth);

  app.get('/workspaces', async (req) => {
    const ws = await prisma.workspace.findMany({
      where: { orgId: req.user.orgId }, orderBy: { createdAt: 'asc' },
      include: { _count: { select: { runners: { where: { deletedAt: null } }, automations: { where: { deletedAt: null } } } } },
    });
    return ws.map((w) => ({ id: w.id, name: w.name, environment: w.environment, createdAt: w.createdAt, machines: w._count.runners, automations: w._count.automations }));
  });

  app.post('/workspaces', async (req, reply) => {
    const b = z.object({ name: z.string().trim().min(1), environment: z.enum(['production', 'development']) }).parse(req.body);
    if (await prisma.workspace.findFirst({ where: { orgId: req.user.orgId, name: { equals: b.name, mode: 'insensitive' }, environment: b.environment } }))
      return reply.code(409).send({ error: 'Já existe um ambiente com este cliente e tipo.' });
    const w = await prisma.workspace.create({ data: { orgId: req.user.orgId, ...b } });
    await audit(req, 'workspace.create', 'workspace', w.id, b);
    return reply.code(201).send(w);
  });

  // Regras da tela: manter ao menos um ambiente e só excluir sem máquinas cadastradas.
  app.delete('/workspaces/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const w = await prisma.workspace.findFirst({ where: { id, orgId: req.user.orgId } });
    if (!w) return reply.code(404).send({ error: 'Ambiente não encontrado.' });
    if ((await prisma.workspace.count({ where: { orgId: req.user.orgId } })) <= 1) return reply.code(409).send({ error: 'É preciso manter ao menos um ambiente.' });
    const n = await prisma.runner.count({ where: { workspaceId: id, deletedAt: null } });
    if (n) return reply.code(409).send({ error: `Há ${n} ${n > 1 ? 'máquinas cadastradas' : 'máquina cadastrada'}.` });
    await prisma.workspace.delete({ where: { id } });
    await audit(req, 'workspace.delete', 'workspace', id);
    return { ok: true };
  });
};

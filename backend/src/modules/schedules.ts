import type { FastifyPluginAsync } from 'fastify';
import cron from 'node-cron';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit, withWorkspace } from '../lib/context.js';

const uuid = z.string().uuid();
const cronOk = (s: string) => s.trim().split(/\s+/).length === 5 && cron.validate(s.trim()); // 5 campos, como na tela
const MSG_CRON = 'Expressão cron inválida (use 5 campos, ex.: 0 6 * * *).';

/** Agendamentos (tela Agendamentos). O disparo automático (tick do cron) entra na etapa do scheduler. */
export const schedulesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', withWorkspace);

  app.get('/schedules', async (req) => {
    const ss = await prisma.schedule.findMany({ where: { workspaceId: req.wid }, include: { automation: true, runner: true }, orderBy: { createdAt: 'asc' } });
    return ss.map((s) => ({ id: s.id, automation: s.automation.name, automationId: s.automationId, runner: s.runner?.name ?? null, runnerId: s.runnerId,
      cron: s.cron, timezone: s.timezone, enabled: s.enabled, lastRunAt: s.lastRunAt }));
  });

  app.post('/schedules', async (req, reply) => {
    const b = z.object({ automationId: uuid, runnerId: uuid, cron: z.string(), timezone: z.string().default('America/Sao_Paulo'), params: z.record(z.unknown()).default({}) }).parse(req.body);
    if (!cronOk(b.cron)) return reply.code(422).send({ error: MSG_CRON });
    if (!(await prisma.automation.findFirst({ where: { id: b.automationId, workspaceId: req.wid, deletedAt: null } }))) return reply.code(404).send({ error: 'Automação não encontrada.' });
    if (!(await prisma.runner.findFirst({ where: { id: b.runnerId, workspaceId: req.wid, deletedAt: null } }))) return reply.code(404).send({ error: 'Máquina não encontrada.' });
    if (!(await prisma.automation.count({ where: { id: b.automationId, runners: { some: { id: b.runnerId } } } }))) return reply.code(409).send({ error: 'Esta máquina não está atrelada à automação.' });
    const s = await prisma.schedule.create({ data: { orgId: req.user.orgId, workspaceId: req.wid, automationId: b.automationId, runnerId: b.runnerId, cron: b.cron.trim(), timezone: b.timezone, params: b.params as object } });
    await audit(req, 'schedule.create', 'schedule', s.id);
    return reply.code(201).send(s);
  });

  app.patch('/schedules/:id', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = z.object({ enabled: z.boolean().optional(), cron: z.string().optional(), timezone: z.string().optional() }).parse(req.body);
    if (b.cron !== undefined && !cronOk(b.cron)) return reply.code(422).send({ error: MSG_CRON });
    const r = await prisma.schedule.updateMany({ where: { id, workspaceId: req.wid }, data: { ...b, cron: b.cron?.trim() } });
    return r.count ? { ok: true } : reply.code(404).send({ error: 'Agendamento não encontrado.' });
  });

  app.post('/schedules/bulk-delete', async (req) => {
    const { ids } = z.object({ ids: z.array(uuid).min(1) }).parse(req.body);
    const r = await prisma.schedule.deleteMany({ where: { id: { in: ids }, workspaceId: req.wid } });
    await audit(req, 'schedule.bulk_delete', 'schedule', undefined, { deleted: r.count });
    return { deleted: r.count };
  });
};

import { createHash, randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config.js';
import { prisma } from '../db.js';
import { audit, withWorkspace } from '../lib/context.js';

const ATIVOS = ['pending', 'assigned', 'running', 'cancelling'] as const;
const ids = z.object({ ids: z.array(z.string().uuid()).min(1) });

/** Máquinas (runners). A chave de pareamento é exibida uma única vez; só o hash é guardado. */
export const runnersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', withWorkspace);

  const uso = async (runnerId: string) => ({
    schedules: await prisma.schedule.count({ where: { runnerId } }),
    activeJobs: await prisma.job.count({ where: { runnerId, status: { in: [...ATIVOS] } } }),
    automations: await prisma.automation.count({ where: { runners: { some: { id: runnerId } }, deletedAt: null } }),
  });
  const buscar = (id: string, wid: string) => prisma.runner.findFirst({ where: { id, workspaceId: wid, deletedAt: null } });

  app.get('/runners', async (req) => {
    const rs = await prisma.runner.findMany({ where: { workspaceId: req.wid, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    return Promise.all(rs.map(async (r) => ({
      id: r.id, name: r.name, status: r.status, paired: r.paired, lastHeartbeatAt: r.lastHeartbeatAt, version: r.version, inUse: await uso(r.id),
    })));
  });

  app.post('/runners', async (req, reply) => {
    const { name } = z.object({ name: z.string().trim().min(1) }).parse(req.body);
    if (await prisma.runner.findFirst({ where: { workspaceId: req.wid, deletedAt: null, name: { equals: name, mode: 'insensitive' } } }))
      return reply.code(409).send({ error: 'Já existe uma máquina com este nome.' });
    const r = await prisma.runner.create({ data: { orgId: req.user.orgId, workspaceId: req.wid, name } });
    await audit(req, 'runner.create', 'runner', r.id);
    return reply.code(201).send(r);
  });

  app.post('/runners/:id/pairing-key', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    if (!(await buscar(id, req.wid))) return reply.code(404).send({ error: 'Máquina não encontrada.' });
    await prisma.registrationToken.deleteMany({ where: { runnerId: id, usedAt: null } }); // a chave anterior deixa de valer
    const key = randomBytes(12).toString('hex').toUpperCase().match(/.{6}/g)!.join('-');
    const expiresAt = new Date(Date.now() + 24 * 3600_000);
    await prisma.registrationToken.create({
      data: { orgId: req.user.orgId, runnerId: id, tokenHash: createHash('sha256').update(key).digest('hex'), expiresAt, createdBy: req.user.sub },
    });
    await audit(req, 'runner.pairing_key', 'runner', id);
    return { key, expiresAt }; // única vez em que a chave aparece
  });

  app.post('/runners/:id/unpair', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    if (!(await buscar(id, req.wid))) return reply.code(404).send({ error: 'Máquina não encontrada.' });
    await prisma.runner.update({ where: { id }, data: { paired: false, status: 'offline', credentialHash: null } });
    await audit(req, 'runner.unpair', 'runner', id);
    return { ok: true };
  });

  // Somente DEMO_MODE=true: simula o runner (pareia e alterna online/offline) enquanto o runner real não existe.
  app.post('/runners/:id/simulate', async (req, reply) => {
    if (!env.DEMO_MODE) return reply.code(403).send({ error: 'Disponível apenas em modo demonstração (DEMO_MODE=true).' });
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await buscar(id, req.wid);
    if (!r) return reply.code(404).send({ error: 'Máquina não encontrada.' });
    const dados = !r.paired ? { paired: true, status: 'online' as const, version: '0.1.0' } : { status: r.status === 'online' ? ('offline' as const) : ('online' as const) };
    await prisma.runner.update({ where: { id }, data: { ...dados, lastHeartbeatAt: new Date() } });
    return { ok: true };
  });

  // Exclusão em lote (checkbox da tela): máquinas com agendamentos ou execuções ativas são ignoradas.
  app.post('/runners/bulk-delete', async (req) => {
    const { ids: lista } = ids.parse(req.body);
    const skipped: { id: string; reason: string }[] = [];
    let deleted = 0;
    for (const id of lista) {
      if (!(await buscar(id, req.wid))) { skipped.push({ id, reason: 'Máquina não encontrada.' }); continue; }
      const u = await uso(id);
      if (u.schedules || u.activeJobs || u.automations) {
        skipped.push({ id, reason: u.automations ? `Há ${u.automations} ${u.automations > 1 ? 'automações atreladas' : 'automação atrelada'}.` : 'Em uso (agendamentos ou execuções ativas).' });
        continue;
      }
      await prisma.runner.update({ where: { id }, data: { deletedAt: new Date(), paired: false, status: 'offline', credentialHash: null } });
      deleted++;
    }
    await audit(req, 'runner.bulk_delete', 'runner', undefined, { deleted });
    return { deleted, skipped };
  });
};

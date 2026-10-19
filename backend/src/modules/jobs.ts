import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../config.js';
import { audit, withWorkspace } from '../lib/context.js';
import { capturarItens, dequeue } from './queues.js';

const uuid = z.string().uuid();
const ATIVOS = ['pending', 'assigned', 'running', 'cancelling'] as const;
const evento = (jobId: string, level: 'INFO' | 'WARN' | 'ERROR', message: string) => prisma.jobLog.create({ data: { jobId, level, message } });

/** Execuções (telas Execuções e detalhe com logs). Front: pending/assigned/running = "em execução", timeout = "abortada". */
export const jobsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', withWorkspace);
  const include = { version: { include: { automation: true } }, runner: true } as const;
  const dto = (j: Awaited<ReturnType<typeof prisma.job.findFirstOrThrow<{ include: typeof include }>>>) => ({
    id: j.id, automation: { id: j.version.automation.id, name: j.version.automation.name, deleted: !!j.version.automation.deletedAt },
    version: j.version.version, runner: j.runner?.name ?? null, status: j.status, cancelMode: j.cancelMode,
    queuedAt: j.queuedAt, startedAt: j.startedAt, finishedAt: j.finishedAt,
  });

  app.get('/jobs', async (req) => {
    const q = z.object({ automationId: uuid.optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50), ativos: z.enum(['true', 'false']).optional() }).parse(req.query);
    const where = { workspaceId: req.wid, ...(q.automationId ? { version: { automationId: q.automationId } } : {}), ...(q.ativos === 'true' ? { status: { in: [...ATIVOS] } } : {}) };
    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({ where, include, orderBy: { queuedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return { total, items: jobs.map(dto) };
  });

  app.get('/jobs/:id', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const j = await prisma.job.findFirst({ where: { id, workspaceId: req.wid }, include });
    return j ? dto(j) : reply.code(404).send({ error: 'Execução não encontrada.' });
  });

  // Logs da execução; `after` (ISO) permite buscar só as linhas novas. O tempo real por SSE entra com o gateway.
  app.get('/jobs/:id/logs', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { after } = z.object({ after: z.coerce.date().optional() }).parse(req.query);
    if (!(await prisma.job.findFirst({ where: { id, workspaceId: req.wid }, select: { id: true } }))) return reply.code(404).send({ error: 'Execução não encontrada.' });
    return prisma.jobLog.findMany({ where: { jobId: id, ...(after ? { ts: { gt: after } } : {}) }, orderBy: { ts: 'asc' }, take: 5000, select: { ts: true, level: true, source: true, message: true } });
  });

  // Dispara uma execução manual; só em máquina pareada e online.
  app.post('/jobs', async (req, reply) => {
    const b = z.object({ automationId: uuid, runnerId: uuid, params: z.record(z.unknown()).default({}) }).parse(req.body);
    const a = await prisma.automation.findFirst({ where: { id: b.automationId, workspaceId: req.wid, deletedAt: null } });
    if (!a?.currentVersionId) return reply.code(404).send({ error: 'Automação não encontrada.' });
    const r = await prisma.runner.findFirst({ where: { id: b.runnerId, workspaceId: req.wid, deletedAt: null } });
    if (!r) return reply.code(404).send({ error: 'Máquina não encontrada.' });
    if (!(await prisma.automation.count({ where: { id: a.id, runners: { some: { id: r.id } } } }))) return reply.code(409).send({ error: 'Esta máquina não está atrelada à automação.' });
    const versao = await prisma.automationVersion.findUnique({ where: { id: a.currentVersionId } });
    if (!versao?.packagePath) return reply.code(409).send({ error: 'Envie o pacote (.zip) da automação antes de executar.' });
    if (!r.paired || r.status !== 'online') return reply.code(409).send({ error: 'Só é possível executar em máquinas online.' });
    const j = await prisma.job.create({ data: { orgId: req.user.orgId, workspaceId: req.wid, versionId: a.currentVersionId, runnerId: r.id, params: b.params as object, lastSeenAt: new Date() } });
    await evento(j.id, 'INFO', 'Execução enfileirada.');
    // Todos os itens NEW da fila da automação formam este JOB. O agendador chamará a mesma função ao disparar um agendamento.
    const n = await capturarItens(a.id, j.id);
    if (n) await evento(j.id, 'INFO', `${n} item(ns) da fila incluídos neste JOB.`);
    if (n && env.DEMO_MODE) { // modo demonstração (sem runner): o primeiro item já começa a ser processado
      await dequeue(j.id);
      await prisma.job.update({ where: { id: j.id }, data: { status: 'running', startedAt: new Date() } });
    }
    await audit(req, 'job.create', 'job', j.id);
    return reply.code(201).send({ id: j.id, status: j.status }); // o agendador/gateway faz o job.assign (próxima etapa)
  });

  // Somente DEMO_MODE=true: simula o término de uma execução (sem runner real).
  app.post('/jobs/:id/simulate', async (req, reply) => {
    if (!env.DEMO_MODE) return reply.code(403).send({ error: 'Disponível apenas em modo demonstração (DEMO_MODE=true).' });
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { status } = z.object({ status: z.enum(['success', 'failed', 'timeout', 'cancelled']) }).parse(req.body);
    const j = await prisma.job.findFirst({ where: { id, workspaceId: req.wid } });
    if (!j) return reply.code(404).send({ error: 'Execução não encontrada.' });
    if (!(ATIVOS as readonly string[]).includes(j.status)) return reply.code(409).send({ error: 'A execução já terminou.' });
    const agora = new Date();
    await prisma.job.update({ where: { id }, data: { status, startedAt: j.startedAt ?? agora, finishedAt: agora, error: status === 'failed' ? 'Falha simulada.' : status === 'timeout' ? 'Mais de 48 h sem resposta.' : null } });
    const t = agora.getTime();
    const linhas: [('INFO' | 'WARN' | 'ERROR'), string][] = status === 'success'
      ? [['INFO', 'Initialization Finished'], ['INFO', 'Loop Station Started'], ['INFO', 'Executando item 1 de 1'], ['INFO', 'Process Finished'], ['INFO', 'Task finalizada com sucesso.']]
      : status === 'failed' ? [['INFO', 'Initialization Finished'], ['INFO', 'Executando item 1 de 1'], ['WARN', 'Tentativa 1 de 3 falhou'], ['ERROR', 'Exceção ao processar o item 1: elemento não encontrado']]
      : [['INFO', 'Initialization Finished'], ['INFO', 'Executando item 1 de 1']];
    await prisma.jobLog.createMany({ data: linhas.map(([level, message], i) => ({ jobId: id, level, source: 'automacao', message, ts: new Date(t - 100 + i * 10) })) });
    const fim: Record<string, ['INFO' | 'WARN' | 'ERROR', string]> = {
      success: ['INFO', 'Execução finalizada com sucesso.'], failed: ['ERROR', 'Execução finalizada com falha.'],
      cancelled: ['WARN', 'Execução cancelada.'], timeout: ['ERROR', 'Execução abortada: mais de 48 h sem resposta.'],
    };
    await prisma.jobLog.create({ data: { jobId: id, level: fim[status][0], source: 'orquestrador', message: fim[status][1], ts: new Date(t + 10) } });
    return { ok: true };
  });

  // Cancelamento: graceful = aguarda o item atual terminar ("cancelando"); abrupt = mata o processo.
  app.post('/jobs/:id/cancel', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { mode } = z.object({ mode: z.enum(['graceful', 'abrupt']) }).parse(req.body);
    const j = await prisma.job.findFirst({ where: { id, workspaceId: req.wid } });
    if (!j) return reply.code(404).send({ error: 'Execução não encontrada.' });
    if (!(ATIVOS as readonly string[]).includes(j.status)) return reply.code(409).send({ error: 'A execução já terminou.' });
    const agora = mode === 'abrupt' || j.status === 'pending' || j.status === 'assigned';
    const r = await prisma.job.update({ where: { id }, data: { status: agora ? 'cancelled' : 'cancelling', cancelMode: mode, finishedAt: agora ? new Date() : undefined } });
    await evento(id, 'WARN', mode === 'abrupt' ? 'Cancelamento abrupto: processo encerrado.' : 'Cancelamento elegante solicitado: aguardando o item atual terminar.');
    await audit(req, 'job.cancel', 'job', id, { mode });
    return { id, status: r.status }; // TODO gateway: enviar job.cancel ao runner
  });
};

/** Execuções ativas há mais de 48 h sem resposta do runner viram `timeout` (front: "abortada"). */
export function startSweeper() {
  const varrer = async () => {
    const velhos = await prisma.job.findMany({ where: { status: { in: [...ATIVOS] }, lastSeenAt: { lt: new Date(Date.now() - 48 * 3600_000) } }, select: { id: true } });
    for (const j of velhos) {
      await prisma.job.update({ where: { id: j.id }, data: { status: 'timeout', finishedAt: new Date(), error: 'Mais de 48 h sem resposta.' } });
      await evento(j.id, 'ERROR', 'Execução abortada: mais de 48 h sem resposta.');
    }
  };
  setInterval(() => { varrer().catch(() => undefined); }, 60_000);
}

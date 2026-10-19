import type { Prisma, QueueItemStatus } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config.js';
import { prisma } from '../db.js';
import { audit, withWorkspace } from '../lib/context.js';

const uuid = z.string().uuid();

/** Fila da automação (criada sob demanda; nome = nome da automação). */
export async function ensureQueue(automationId: string, workspaceId: string, orgId: string, nome: string) {
  return prisma.queue.upsert({
    where: { workspaceId_name: { workspaceId, name: nome } }, update: {},
    create: { orgId, workspaceId, automationId, name: nome },
  });
}

const JOB_ATIVO = ['pending', 'assigned', 'running', 'cancelling'] as const;

/**
 * Início de um JOB (execução manual ou agendada): todos os itens `new` da fila da automação entram no JOB
 * (`waiting` = AGUARDANDO a vez). Itens inseridos depois ficam `new` e entram no próximo JOB. Devolve quantos entraram.
 */
export async function capturarItens(automationId: string, jobId: string): Promise<number> {
  const r = await prisma.queueItem.updateMany({
    where: { status: 'new', queue: { automationId } },
    data: { status: 'waiting', processingJobId: jobId, log: 'Incluído no JOB: aguardando a vez (máquina ocupada).' },
  });
  return r.count;
}

/**
 * Entrega ao runner o próximo item do JOB (FIFO: maior prioridade e mais antigo entre os `waiting` do JOB) e o marca
 * `in_progress`, com FOR UPDATE SKIP LOCKED. Devolve null quando não há mais itens (o JOB pode terminar).
 * Será usado pelo gateway no `queue.get` do SDK.
 */
export async function dequeue(jobId: string) {
  const r = await prisma.$queryRaw<{ id: string; data: unknown; reference: string | null }[]>`
    UPDATE queue_items SET status = 'in_progress'::"QueueItemStatus", attempts = attempts + 1,
           log = 'Processamento iniciado.', "updatedAt" = now()
    WHERE id = (SELECT id FROM queue_items WHERE "processingJobId" = ${jobId} AND status = 'waiting'::"QueueItemStatus"
                ORDER BY priority DESC, "queuedAt" ASC, seq ASC FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id, data, reference`;
  return r[0] ?? null;
}

/** Em quais status cada ação da tela Fila se aplica (undefined = qualquer). */
const ELEGIVEL: Record<'cancel' | 'duplicate' | 'reprocess', QueueItemStatus[] | undefined> = {
  cancel: ['waiting', 'in_progress'], duplicate: undefined, reprocess: ['failed', 'cancelled'], // 'new' ainda não pertence a um JOB
};

export const queuesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', withWorkspace);
  const automacao = (id: string, wid: string) => prisma.automation.findFirst({ where: { id, workspaceId: wid, deletedAt: null } });

  // Lista paginada (10, 50 ou 100 por página); order=recent (padrão da tela) ou oldest. "Timestamp" = queuedAt.
  app.get('/automations/:id/queue-items', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().refine((n) => [10, 50, 100].includes(n)).default(10), order: z.enum(['recent', 'oldest']).default('recent') }).parse(req.query);
    if (!(await automacao(id, req.wid))) return reply.code(404).send({ error: 'Automação não encontrada.' });
    const where = { queue: { automationId: id, workspaceId: req.wid } };
    const [total, items] = await Promise.all([
      prisma.queueItem.count({ where }),
      prisma.queueItem.findMany({ where, orderBy: [{ queuedAt: q.order === 'recent' ? 'desc' : 'asc' }, { seq: q.order === 'recent' ? 'desc' : 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize,
      items: items.map((i) => ({ id: i.id, reference: i.reference, status: i.status, jobId: i.processingJobId, log: i.log, queuedAt: i.queuedAt, updatedAt: i.updatedAt })) };
  });

  // Dados de um item (tela de detalhe aberta pela coluna Referência).
  app.get('/queue-items/:id', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const i = await prisma.queueItem.findFirst({ where: { id, queue: { workspaceId: req.wid } }, include: { queue: { include: { automation: true } } } });
    if (!i) return reply.code(404).send({ error: 'Item não encontrado.' });
    return {
      id: i.id, automationId: i.queue.automationId, automation: i.queue.automation?.name ?? null, reference: i.reference, data: i.data,
      status: i.status, jobId: i.processingJobId, log: i.log, error: i.error, attempts: i.attempts,
      queuedAt: i.queuedAt, updatedAt: i.updatedAt, finishedAt: i.finishedAt,
    };
  });

  // Inserção de itens (a tela não tem mais formulário; será chamada pelo SDK via gateway, e serve para testes).
  app.post('/automations/:id/queue-items', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { items } = z.object({ items: z.array(z.object({
      // data: dicionário livre (campos dinâmicos definidos pela automação); reference: dado de referência enviado pela automação
      data: z.record(z.unknown()).refine((d) => JSON.stringify(d).length <= 262_144, 'Dados do item grandes demais (máximo 256 KB).'),
      reference: z.union([z.string(), z.number()]).transform(String).pipe(z.string().trim().min(1).max(500)),
      priority: z.number().int().default(0),
    })).min(1).max(1000) }).parse(req.body);
    const a = await automacao(id, req.wid);
    if (!a) return reply.code(404).send({ error: 'Automação não encontrada.' });
    const fila = await ensureQueue(a.id, req.wid, req.user.orgId, a.name);
    const t = new Date();
    await prisma.queueItem.createMany({ data: items.map((i) => ({ queueId: fila.id, orgId: req.user.orgId, data: i.data as Prisma.InputJsonValue, reference: i.reference, priority: i.priority, log: 'Item adicionado à fila.', queuedAt: t })) });
    return reply.code(201).send({ inserted: items.length });
  });

  // Somente DEMO_MODE=true: um passo do runner no JOB em andamento (termina o item em processamento e inicia o próximo; sem itens, conclui o JOB).
  app.post('/automations/:id/simulate-runner', async (req, reply) => {
    if (!env.DEMO_MODE) return reply.code(403).send({ error: 'Disponível apenas em modo demonstração (DEMO_MODE=true).' });
    const { id } = z.object({ id: uuid }).parse(req.params);
    if (!(await automacao(id, req.wid))) return reply.code(404).send({ error: 'Automação não encontrada.' });
    const jobs = await prisma.job.findMany({ where: { workspaceId: req.wid, version: { automationId: id }, status: { in: ['pending', 'assigned', 'running'] } }, orderBy: { queuedAt: 'asc' } });
    let alvo: (typeof jobs)[number] | null = null;
    for (const j of jobs) {
      if (await prisma.queueItem.count({ where: { processingJobId: j.id, status: { in: ['waiting', 'in_progress'] } } })) { alvo = j; break; }
    }
    if (!alvo) return reply.code(409).send({ error: 'Nenhum JOB em andamento com itens para esta automação. Inicie uma execução na tela Execuções.' });
    const agora = new Date();
    const atual = await prisma.queueItem.findFirst({ where: { processingJobId: alvo.id, status: 'in_progress' } });
    if (atual) {
      const ok = Math.random() >= 0.25;
      await prisma.queueItem.update({ where: { id: atual.id }, data: ok
        ? { status: 'done', log: 'Item processado com sucesso.', finishedAt: agora }
        : { status: 'failed', log: 'Erro ao processar o item: elemento não encontrado.', error: 'elemento não encontrado', finishedAt: agora } });
    }
    const proximo = await dequeue(alvo.id);
    await prisma.job.update({ where: { id: alvo.id }, data: proximo
      ? { status: 'running', startedAt: alvo.startedAt ?? agora, lastSeenAt: agora }
      : { status: 'success', startedAt: alvo.startedAt ?? agora, finishedAt: agora, lastSeenAt: agora } });
    if (!proximo) await prisma.jobLog.create({ data: { jobId: alvo.id, level: 'INFO', source: 'orquestrador', message: 'Execução finalizada com sucesso.' } });
    return { jobId: alvo.id, finished: !proximo };
  });

  // Ações em lote da tela: cancelar (só aguardando), duplicar (qualquer), reprocessar (falha/cancelado -> reentra no fim da fila).
  app.post('/queue-items/actions', async (req) => {
    const b = z.object({ action: z.enum(['cancel', 'cancel_job', 'duplicate', 'reprocess']), ids: z.array(uuid).min(1).max(1000) }).parse(req.body);
    if (b.action === 'cancel_job') { // cancela o JOB inteiro dos itens selecionados: itens waiting/in_progress e o próprio job
      const sel = await prisma.queueItem.findMany({ where: { id: { in: b.ids }, queue: { workspaceId: req.wid }, processingJobId: { not: null } }, select: { processingJobId: true } });
      const jobIds = [...new Set(sel.map((i) => i.processingJobId as string))];
      const agora = new Date();
      const itens = await prisma.queueItem.updateMany({ where: { processingJobId: { in: jobIds }, status: { in: ['waiting', 'in_progress'] } }, data: { status: 'cancelled', log: 'JOB cancelado.', finishedAt: agora } });
      const jobs = await prisma.job.updateMany({ where: { id: { in: jobIds }, workspaceId: req.wid, status: { in: [...JOB_ATIVO] } }, data: { status: 'cancelled', cancelMode: 'abrupt', finishedAt: agora } });
      await audit(req, 'queue_item.cancel_job', 'queue_item', undefined, { jobs: jobs.count, items: itens.count });
      return { requested: b.ids.length, affected: itens.count, jobs: jobs.count }; // TODO gateway: enviar job.cancel ao runner
    }
    const el = ELEGIVEL[b.action];
    const alvo = await prisma.queueItem.findMany({ where: { id: { in: b.ids }, queue: { workspaceId: req.wid }, ...(el ? { status: { in: el } } : {}) } });
    const idsAlvo = alvo.map((i) => i.id);
    const agora = new Date();
    if (b.action === 'cancel') await prisma.queueItem.updateMany({ where: { id: { in: idsAlvo } }, data: { status: 'cancelled', log: 'Cancelado pelo usuário.', finishedAt: agora } });
    if (b.action === 'reprocess') await prisma.queueItem.updateMany({ where: { id: { in: idsAlvo } }, data: { status: 'new', processingJobId: null, log: 'Reprocessamento solicitado.', error: null, finishedAt: null, queuedAt: agora } });
    if (b.action === 'duplicate') {
      await prisma.queueItem.createMany({ data: alvo.map((i) => ({ queueId: i.queueId, orgId: i.orgId, data: i.data as Prisma.InputJsonValue, reference: i.reference, priority: i.priority, log: 'Item duplicado.', queuedAt: agora })) });
    }
    await audit(req, `queue_item.${b.action}`, 'queue_item', undefined, { requested: b.ids.length, affected: alvo.length });
    return { requested: b.ids.length, affected: alvo.length };
  });
};

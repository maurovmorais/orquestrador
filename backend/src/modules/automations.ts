import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AutomationParameter } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config.js';
import { prisma } from '../db.js';
import { audit, withWorkspace } from '../lib/context.js';
import { encrypt } from '../lib/crypto.js';
import { inspecionarZip } from '../lib/zip.js';
import { NOME, normalizar, tipoSchema, validarValor } from '../lib/typed.js';

const uuid = z.string().uuid();
const ATIVOS = ['pending', 'assigned', 'running', 'cancelling'] as const;
const NOME_INVALIDO = 'Nome inválido: use letras, números e _ (sem espaços e sem começar por número).';

const mascara = (p: AutomationParameter) => ({
  id: p.id, name: p.name, type: p.type, value: p.type === 'secret' ? null : p.value, active: p.active, required: p.required, description: p.description,
});

/** Automações (tela Automações) e seus parâmetros (tela de detalhe da automação). */
export const automationsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', withWorkspace);
  const buscar = (id: string, wid: string) => prisma.automation.findFirst({ where: { id, workspaceId: wid, deletedAt: null } });

  app.get('/automations', async (req) => {
    const as = await prisma.automation.findMany({ where: { workspaceId: req.wid, deletedAt: null }, include: { currentVersion: true, runners: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } });
    return as.map((a) => ({ id: a.id, name: a.name, description: a.description, version: a.currentVersion?.version ?? null, runners: a.runners, hasPackage: !!a.currentVersion?.packagePath, packageSize: a.currentVersion?.packageSize ?? null, createdAt: a.createdAt }));
  });

  // Cria a automação e a versão 1 (o upload do .zip entra na próxima etapa).
  app.post('/automations', async (req, reply) => {
    const b = z.object({ name: z.string().trim().min(1), description: z.string().default(''), runnerIds: z.array(uuid).min(1) }).parse(req.body);
    if (await prisma.automation.findFirst({ where: { workspaceId: req.wid, name: { equals: b.name, mode: 'insensitive' }, deletedAt: null } })) return reply.code(409).send({ error: 'Já existe uma automação com este nome.' });
    const runnerIds = [...new Set(b.runnerIds)];
    if ((await prisma.runner.count({ where: { id: { in: runnerIds }, workspaceId: req.wid, deletedAt: null } })) !== runnerIds.length) return reply.code(404).send({ error: 'Máquina não encontrada.' });
    const a = await prisma.$transaction(async (tx) => {
      const nova = await tx.automation.create({ data: { orgId: req.user.orgId, workspaceId: req.wid, name: b.name, description: b.description, runners: { connect: runnerIds.map((id) => ({ id })) } } });
      const v = await tx.automationVersion.create({ data: { automationId: nova.id, version: 1 } });
      return tx.automation.update({ where: { id: nova.id }, data: { currentVersionId: v.id } });
    });
    await audit(req, 'automation.create', 'automation', a.id);
    return reply.code(201).send(a);
  });

  // Troca as máquinas atreladas à automação (uma ou mais).
  app.patch('/automations/:id', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { runnerIds: lista } = z.object({ runnerIds: z.array(uuid).min(1) }).parse(req.body);
    const runnerIds = [...new Set(lista)];
    if (!(await buscar(id, req.wid))) return reply.code(404).send({ error: 'Automação não encontrada.' });
    if ((await prisma.runner.count({ where: { id: { in: runnerIds }, workspaceId: req.wid, deletedAt: null } })) !== runnerIds.length) return reply.code(404).send({ error: 'Máquina não encontrada.' });
    await prisma.automation.update({ where: { id }, data: { runners: { set: runnerIds.map((r) => ({ id: r })) } } });
    await audit(req, 'automation.set_runners', 'automation', id, { runnerIds });
    return { ok: true };
  });

  // ---- pacote (.zip da automação) ----
  // Corpo binário (Content-Type: application/zip). Cada envio vira uma nova versão; o primeiro preenche a versão 1.
  app.post('/automations/:id/package', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const a = await buscar(id, req.wid);
    if (!a) return reply.code(404).send({ error: 'Automação não encontrada.' });
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return reply.code(400).send({ error: 'Envie o arquivo .zip no corpo da requisição (Content-Type: application/zip).' });
    const info = inspecionarZip(buf);
    if (info.erro) return reply.code(422).send({ error: info.erro });

    const atual = a.currentVersionId ? await prisma.automationVersion.findUnique({ where: { id: a.currentVersionId } }) : null;
    const reaproveitar = !!atual && !atual.packagePath; // versão 1 criada junto com a automação, ainda sem pacote
    const maior = await prisma.automationVersion.aggregate({ where: { automationId: id }, _max: { version: true } });
    const numero = reaproveitar && atual ? atual.version : (maior._max.version ?? 0) + 1;

    const dir = join(env.PACKAGES_DIR, req.user.orgId, id);
    await mkdir(dir, { recursive: true });
    const caminho = join(dir, `v${numero}.zip`);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    await writeFile(`${caminho}.tmp`, buf);
    await rename(`${caminho}.tmp`, caminho);
    try {
      const dados = { packagePath: caminho, packageSha256: sha256, packageSize: buf.length, entrypoint: info.entrypoint, requirements: info.requirements };
      const v = reaproveitar && atual
        ? await prisma.automationVersion.update({ where: { id: atual.id }, data: dados })
        : await prisma.automationVersion.create({ data: { automationId: id, version: numero, ...dados } });
      await prisma.automation.update({ where: { id }, data: { currentVersionId: v.id } });
      await audit(req, 'automation.upload_package', 'automation', id, { version: numero, size: buf.length, sha256 });
      return reply.code(201).send({ version: numero, size: buf.length, sha256, entrypoint: info.entrypoint });
    } catch (e) {
      await unlink(caminho).catch(() => undefined); // não deixa arquivo órfão se o banco falhar
      throw e;
    }
  });

  app.get('/automations/:id/versions', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const a = await buscar(id, req.wid);
    if (!a) return reply.code(404).send({ error: 'Automação não encontrada.' });
    const vs = await prisma.automationVersion.findMany({ where: { automationId: id }, orderBy: { version: 'desc' } });
    return vs.map((v) => ({ id: v.id, version: v.version, size: v.packageSize, sha256: v.packageSha256, entrypoint: v.entrypoint, createdAt: v.createdAt, current: v.id === a.currentVersionId, hasPackage: !!v.packagePath }));
  });

  // Rollback/avanço: torna uma versão (com pacote) a versão atual.
  app.post('/automations/:id/versions/:vid/activate', async (req, reply) => {
    const { id, vid } = z.object({ id: uuid, vid: uuid }).parse(req.params);
    if (!(await buscar(id, req.wid))) return reply.code(404).send({ error: 'Automação não encontrada.' });
    const v = await prisma.automationVersion.findFirst({ where: { id: vid, automationId: id } });
    if (!v?.packagePath) return reply.code(409).send({ error: 'Esta versão não tem pacote.' });
    await prisma.automation.update({ where: { id }, data: { currentVersionId: vid } });
    await audit(req, 'automation.activate_version', 'automation', id, { version: v.version });
    return { ok: true };
  });

  // Download do pacote (o runner usará o mesmo conteúdo ao carregar a automação na pasta bot).
  app.get('/automations/:id/versions/:vid/package', async (req, reply) => {
    const { id, vid } = z.object({ id: uuid, vid: uuid }).parse(req.params);
    const a = await buscar(id, req.wid);
    const v = a ? await prisma.automationVersion.findFirst({ where: { id: vid, automationId: id } }) : null;
    if (!a || !v?.packagePath) return reply.code(404).send({ error: 'Pacote não encontrado.' });
    reply.header('Content-Type', 'application/zip').header('Content-Disposition', `attachment; filename="${a.name}-v${v.version}.zip"`);
    return reply.send(createReadStream(v.packagePath));
  });

  // Remove (logicamente) a automação, seus agendamentos, sua fila e seus ativos locais; o histórico de execuções fica.
  app.delete('/automations/:id', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    if (!(await buscar(id, req.wid))) return reply.code(404).send({ error: 'Automação não encontrada.' });
    if (await prisma.job.count({ where: { version: { automationId: id }, status: { in: [...ATIVOS] } } })) return reply.code(409).send({ error: 'Há uma execução em andamento.' });
    await prisma.$transaction([
      prisma.schedule.deleteMany({ where: { automationId: id } }),
      prisma.queue.deleteMany({ where: { automationId: id } }),
      prisma.asset.deleteMany({ where: { automationId: id } }),
      prisma.automation.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
    await audit(req, 'automation.delete', 'automation', id);
    return { ok: true };
  });

  // ---- parâmetros ----
  app.get('/automations/:id/parameters', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    if (!(await buscar(id, req.wid))) return reply.code(404).send({ error: 'Automação não encontrada.' });
    return (await prisma.automationParameter.findMany({ where: { automationId: id }, orderBy: { name: 'asc' } })).map(mascara);
  });

  app.post('/automations/:id/parameters', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    if (!(await buscar(id, req.wid))) return reply.code(404).send({ error: 'Automação não encontrada.' });
    const b = z.object({ name: z.string().trim(), type: tipoSchema, value: z.string().default(''), description: z.string().default('') }).parse(req.body);
    if (!NOME.test(b.name)) return reply.code(422).send({ error: NOME_INVALIDO });
    if (await prisma.automationParameter.findFirst({ where: { automationId: id, name: b.name } })) return reply.code(409).send({ error: 'Já existe um parâmetro com este nome.' });
    const erro = validarValor(b.type, b.value);
    if (erro) return reply.code(422).send({ error: erro });
    const p = await prisma.automationParameter.create({
      data: { automationId: id, name: b.name, type: b.type, value: b.type === 'secret' ? encrypt(b.value) : normalizar(b.type, b.value), description: b.description },
    });
    await audit(req, 'parameter.create', 'automation_parameter', p.id);
    return reply.code(201).send(mascara(p));
  });

  // Alterar (nome, tipo, valor, descrição) e/ou ativar/desativar. Valor confidencial vazio = mantém o atual.
  app.patch('/automations/:id/parameters/:pid', async (req, reply) => {
    const { id, pid } = z.object({ id: uuid, pid: uuid }).parse(req.params);
    const p = await prisma.automationParameter.findFirst({ where: { id: pid, automationId: id, automation: { workspaceId: req.wid, deletedAt: null } } });
    if (!p) return reply.code(404).send({ error: 'Parâmetro não encontrado.' });
    const b = z.object({ name: z.string().trim().optional(), type: tipoSchema.optional(), value: z.string().optional(), description: z.string().optional(), active: z.boolean().optional() }).parse(req.body);
    const name = b.name ?? p.name;
    const type = b.type ?? p.type;
    if (!NOME.test(name)) return reply.code(422).send({ error: NOME_INVALIDO });
    if (name !== p.name && (await prisma.automationParameter.findFirst({ where: { automationId: id, name } }))) return reply.code(409).send({ error: 'Já existe um parâmetro com este nome.' });
    let value: string | undefined;
    const manter = type === 'secret' && p.type === 'secret' && !b.value;
    if (!manter && (b.value !== undefined || type !== p.type)) {
      const v = b.value ?? '';
      const erro = validarValor(type, v);
      if (erro) return reply.code(422).send({ error: erro });
      value = type === 'secret' ? encrypt(v) : normalizar(type, v);
    }
    const novo = await prisma.automationParameter.update({ where: { id: pid }, data: { name, type, value, description: b.description, active: b.active } });
    await audit(req, 'parameter.update', 'automation_parameter', pid);
    return mascara(novo);
  });

  app.post('/automations/:id/parameters/bulk-delete', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { ids } = z.object({ ids: z.array(uuid).min(1) }).parse(req.body);
    if (!(await buscar(id, req.wid))) return reply.code(404).send({ error: 'Automação não encontrada.' });
    const r = await prisma.automationParameter.deleteMany({ where: { id: { in: ids }, automationId: id } });
    await audit(req, 'parameter.bulk_delete', 'automation_parameter', undefined, { deleted: r.count });
    return { deleted: r.count };
  });
};

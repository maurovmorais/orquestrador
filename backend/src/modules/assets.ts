import type { Asset } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit, withWorkspace } from '../lib/context.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { NOME, normalizar, tipoSchema, validarValor } from '../lib/typed.js';

const uuid = z.string().uuid();
const mascara = (a: Asset) => ({
  id: a.id, folder: a.folder, name: a.name, type: a.type, value: a.type === 'secret' ? null : decrypt(a.valueEncrypted),
  scope: a.scope, automationId: a.automationId, active: a.active, description: a.description,
});

/** Ativos que uma automação enxerga: os Globais + os Locais dela (apenas os ativos). Usado pelo `asset.get` do runner. */
export const ativosVisiveis = (workspaceId: string, automationId: string) =>
  prisma.asset.findMany({ where: { workspaceId, active: true, OR: [{ scope: 'global' }, { scope: 'local', automationId }] } });

/** Ativos (tela Ativos): pasta + escopo Global/Local; valores sempre criptografados (AES-256-GCM). */
export const assetsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', withWorkspace);
  const corpo = z.object({
    folder: z.string().trim(), name: z.string().trim(), type: tipoSchema, value: z.string().default(''), description: z.string().default(''),
    scope: z.enum(['global', 'local']).default('global'), automationId: uuid.nullish(),
  });

  /** Valida pasta, nome, escopo e unicidade (pasta + escopo + automação + nome). */
  async function conferir(wid: string, b: z.infer<typeof corpo>, ignorarId?: string) {
    if (!NOME.test(b.folder)) return 'Nome da pasta inválido: use letras, números e _.';
    if (!NOME.test(b.name)) return 'Nome inválido: use letras, números e _.';
    const autId = b.scope === 'local' ? b.automationId ?? null : null;
    if (b.scope === 'local' && (!autId || !(await prisma.automation.findFirst({ where: { id: autId, workspaceId: wid, deletedAt: null } })))) return 'Selecione a automação do escopo Local.';
    const dup = await prisma.asset.findFirst({ where: { workspaceId: wid, folder: b.folder, name: b.name, scope: b.scope, automationId: autId, id: ignorarId ? { not: ignorarId } : undefined } });
    return dup ? 'Já existe um ativo com este nome nesta pasta e escopo.' : '';
  }

  app.get('/assets', async (req) =>
    (await prisma.asset.findMany({ where: { workspaceId: req.wid }, orderBy: [{ folder: 'asc' }, { name: 'asc' }] })).map(mascara));

  app.post('/assets', async (req, reply) => {
    const b = corpo.parse(req.body);
    const erro = (await conferir(req.wid, b)) || validarValor(b.type, b.value);
    if (erro) return reply.code(422).send({ error: erro });
    const a = await prisma.asset.create({
      data: { orgId: req.user.orgId, workspaceId: req.wid, folder: b.folder, name: b.name, type: b.type, valueEncrypted: encrypt(normalizar(b.type, b.value)),
        scope: b.scope, automationId: b.scope === 'local' ? b.automationId : null, description: b.description },
    });
    await audit(req, 'asset.create', 'asset', a.id, { folder: b.folder, name: b.name, scope: b.scope });
    return reply.code(201).send(mascara(a));
  });

  // Alterar e/ou ativar/desativar. Valor confidencial vazio = mantém o atual.
  app.patch('/assets/:id', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const a = await prisma.asset.findFirst({ where: { id, workspaceId: req.wid } });
    if (!a) return reply.code(404).send({ error: 'Ativo não encontrado.' });
    const b = corpo.partial().extend({ active: z.boolean().optional() }).parse(req.body);
    const novo = { folder: b.folder ?? a.folder, name: b.name ?? a.name, type: b.type ?? a.type, value: b.value ?? '', description: b.description ?? a.description,
      scope: b.scope ?? a.scope, automationId: b.automationId !== undefined ? b.automationId : a.automationId };
    const erroEstrutura = await conferir(req.wid, novo, id);
    if (erroEstrutura) return reply.code(422).send({ error: erroEstrutura });
    let valueEncrypted: string | undefined;
    const manter = novo.type === 'secret' && a.type === 'secret' && !b.value;
    if (!manter && (b.value !== undefined || novo.type !== a.type)) {
      const erro = validarValor(novo.type, novo.value);
      if (erro) return reply.code(422).send({ error: erro });
      valueEncrypted = encrypt(normalizar(novo.type, novo.value));
    }
    const r = await prisma.asset.update({
      where: { id },
      data: { folder: novo.folder, name: novo.name, type: novo.type, description: novo.description, scope: novo.scope,
        automationId: novo.scope === 'local' ? novo.automationId : null, valueEncrypted, active: b.active },
    });
    await audit(req, 'asset.update', 'asset', id);
    return mascara(r);
  });

  app.post('/assets/bulk-delete', async (req) => {
    const { ids } = z.object({ ids: z.array(uuid).min(1) }).parse(req.body);
    const r = await prisma.asset.deleteMany({ where: { id: { in: ids }, workspaceId: req.wid } });
    await audit(req, 'asset.bulk_delete', 'asset', undefined, { deleted: r.count });
    return { deleted: r.count };
  });
};

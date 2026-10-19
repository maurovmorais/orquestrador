import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

declare module '@fastify/jwt' {
  interface FastifyJWT { payload: { sub: string; orgId: string }; user: { sub: string; orgId: string } }
}
declare module 'fastify' {
  interface FastifyRequest { wid: string }
}

export async function auth(req: FastifyRequest, reply: FastifyReply) {
  try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'Não autenticado.' }); }
}

/** Autentica e resolve o Ambiente (workspace) pelo cabeçalho x-workspace-id, sempre dentro da organização do usuário. */
export async function withWorkspace(req: FastifyRequest, reply: FastifyReply) {
  await auth(req, reply);
  if (reply.sent) return;
  const wid = req.headers['x-workspace-id'] ?? (req.query as { workspaceId?: string } | undefined)?.workspaceId; // query: usada nos links de download
  if (typeof wid !== 'string') return reply.code(400).send({ error: 'Informe o cabeçalho x-workspace-id.' });
  const ws = await prisma.workspace.findFirst({ where: { id: wid, orgId: req.user.orgId } });
  if (!ws) return reply.code(404).send({ error: 'Ambiente não encontrado.' });
  req.wid = ws.id;
}

export const audit = (req: FastifyRequest, action: string, entity: string, entityId?: string, metadata?: Prisma.InputJsonValue) =>
  prisma.auditLog.create({ data: { orgId: req.user.orgId, userId: req.user.sub, action, entity, entityId, metadata, ip: req.ip } }).catch(() => undefined);

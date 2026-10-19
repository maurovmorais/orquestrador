import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth } from '../lib/context.js';

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', auth);
  app.get('/audit', async (req) => {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    const where = { orgId: req.user.orgId };
    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return { total, items };
  });
};

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();
const email = (process.env.SEED_EMAIL ?? 'admin@demo.local').toLowerCase();
const senha = process.env.SEED_PASSWORD;
if (!senha) throw new Error('Defina SEED_PASSWORD.');

const org = await prisma.organization.upsert({ where: { slug: 'cliente-demo' }, update: {}, create: { name: 'Cliente Demo', slug: 'cliente-demo' } });
const role = (await prisma.role.findFirst({ where: { orgId: org.id, name: 'admin' } })) ?? (await prisma.role.create({ data: { orgId: org.id, name: 'admin', permissions: { all: true } } }));
await prisma.user.upsert({
  where: { email }, update: {},
  create: { orgId: org.id, roleId: role.id, email, name: 'Administrador', passwordHash: await argon2.hash(senha, { type: argon2.argon2id }) },
});
if (!(await prisma.workspace.findFirst({ where: { orgId: org.id } }))) await prisma.workspace.create({ data: { orgId: org.id, name: 'Financeiro', environment: 'production' } });
console.log(`Seed ok: ${email} (cliente: ${org.name})`);
await prisma.$disconnect();

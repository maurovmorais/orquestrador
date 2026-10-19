import { z } from 'zod';

export const env = z.object({
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(32),
  APP_ENCRYPTION_KEY: z.string().min(1), // base64 de 32 bytes (AES-256)
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  PORT: z.coerce.number().default(3000),
  PACKAGES_DIR: z.string().default('./data/packages'), // onde ficam os .zip das automações (volume no Docker)
  MAX_PACKAGE_MB: z.coerce.number().default(100),
  DEMO_MODE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'), // habilita simular o runner
  COOKIE_SECURE: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
}).parse(process.env);

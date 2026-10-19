import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config.js';

const chave = () => Buffer.from(env.APP_ENCRYPTION_KEY, 'base64');

/** AES-256-GCM: devolve base64(iv[12] + tag[16] + texto cifrado). */
export function encrypt(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(), iv);
  const cifrado = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), cifrado]).toString('base64');
}

export function decrypt(b64: string): string {
  const b = Buffer.from(b64, 'base64');
  const d = createDecipheriv('aes-256-gcm', chave(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

import { z } from 'zod';

/** Tipos de parâmetro/ativo. Front-end: string, int, float, bool, data (date), confidencial (secret). */
export const tipoSchema = z.enum(['string', 'int', 'float', 'bool', 'date', 'secret']);
export type Tipo = z.infer<typeof tipoSchema>;

/** Identificador usado pelo SDK Python para buscar o item (letras, números e _). */
export const NOME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const dataValida = (s: string): boolean => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return false;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(a, mes - 1, d);
  return dt.getFullYear() === a && dt.getMonth() === mes - 1 && dt.getDate() === d;
};

/** Mensagem de erro ('' = válido). Mesmas regras do front-end. */
export function validarValor(tipo: Tipo, valor: string): string {
  const v = valor.trim();
  if (tipo === 'int' && !/^-?\d+$/.test(v)) return 'O valor deve ser um número inteiro.';
  if (tipo === 'float' && !/^-?\d+([.,]\d+)?$/.test(v)) return 'O valor deve ser um número decimal (ex.: 10.5).';
  if (tipo === 'bool' && v !== 'true' && v !== 'false') return 'O valor deve ser true ou false.';
  if (tipo === 'date' && !dataValida(v)) return 'Data inválida: use DD/MM/YYYY.';
  if (tipo === 'secret' && !v) return 'Informe o valor confidencial.';
  return '';
}

export const normalizar = (tipo: Tipo, valor: string): string =>
  tipo === 'float' ? valor.trim().replace(',', '.') : tipo === 'string' || tipo === 'secret' ? valor : valor.trim();

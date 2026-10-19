import type { AppData, Parametro, TipoParametro } from '../types';
import { uid } from '../lib/id';

export const TIPOS_PARAMETRO: TipoParametro[] = ['string', 'int', 'float', 'bool', 'data', 'confidencial'];

/** Formato do tipo data (DD/MM/YYYY) na notação do Python: datetime.strptime(valor, FORMATO_PYTHON).date() */
export const FORMATO_PYTHON = '%d/%m/%Y';

/** Máscara de digitação: só números, com as barras inseridas automaticamente (DD/MM/YYYY). */
export const mascaraData = (s: string): string => {
  const n = s.replace(/\D/g, '').slice(0, 8);
  return n.length > 4 ? `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}` : n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n;
};

/** Confere se é uma data real do calendário (ex.: 31/02/2026 é inválida). */
const dataValida = (s: string): boolean => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return false;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(a, mes - 1, d);
  return dt.getFullYear() === a && dt.getMonth() === mes - 1 && dt.getDate() === d;
};

// O nome será usado para buscar o parâmetro a partir do Python, então segue as regras de identificador.
const NOME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Retorna a mensagem de erro ('' = válido). */
export function validarParametro(nome: string, tipo: TipoParametro, valor: string, existentes: Parametro[], ignorarId?: string): string {
  if (!NOME.test(nome)) return 'Nome inválido: use letras, números e _ (sem espaços e sem começar por número).';
  if (existentes.some((p) => p.nome === nome && p.id !== ignorarId)) return 'Já existe um parâmetro com este nome.';
  const v = valor.trim();
  if (tipo === 'int' && !/^-?\d+$/.test(v)) return 'O valor deve ser um número inteiro (ex.: 10).';
  if (tipo === 'float' && !/^-?\d+([.,]\d+)?$/.test(v)) return 'O valor deve ser um número decimal (ex.: 10.5).';
  if (tipo === 'bool' && v !== 'true' && v !== 'false') return 'Selecione true ou false.';
  if (tipo === 'data' && !dataValida(v)) return 'Informe uma data válida no formato DD/MM/YYYY (ex.: 31/12/2026).';
  if (tipo === 'confidencial' && !v) return 'Informe o valor confidencial.';
  return '';
}

export const normalizar = (tipo: TipoParametro, valor: string): string =>
  tipo === 'float' ? valor.trim().replace(',', '.') : tipo === 'string' || tipo === 'confidencial' ? valor : valor.trim();

const mapAut = (d: AppData, id: string, fn: (p: Parametro[]) => Parametro[]): AppData => ({
  ...d, automations: d.automations.map((a) => (a.id === id ? { ...a, parametros: fn(a.parametros ?? []) } : a)),
});

export const addParametro = (d: AppData, autId: string, p: Omit<Parametro, 'id'>): AppData =>
  mapAut(d, autId, (ps) => [...ps, { id: uid(), ...p, ativo: true, valor: normalizar(p.tipo, p.valor) }]);

export const removeParametros = (d: AppData, autId: string, ids: string[]): AppData =>
  mapAut(d, autId, (ps) => ps.filter((p) => !ids.includes(p.id)));

/** Altera nome, tipo, valor e descrição, mantendo o id e o estado ativo/inativo. */
export const updateParametro = (d: AppData, autId: string, id: string, p: Pick<Parametro, 'nome' | 'tipo' | 'valor' | 'desc'>): AppData =>
  mapAut(d, autId, (ps) => ps.map((x) => (x.id === id ? { ...x, ...p, valor: normalizar(p.tipo, p.valor) } : x)));

export const toggleParametro = (d: AppData, autId: string, id: string): AppData =>
  mapAut(d, autId, (ps) => ps.map((x) => (x.id === id ? { ...x, ativo: x.ativo === false } : x)));

export const nomeIdentificador = (s: string): boolean => NOME.test(s);

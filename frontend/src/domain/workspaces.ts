import type { Ambiente, Workspace } from '../types';

/** Nome exibido do ambiente: produção → "Produção", testes → "Desenvolvimento". */
export const nomeAmbiente = (a: Ambiente): string => (a === 'produção' ? 'Produção' : 'Desenvolvimento');

/** Ex.: "Produção: Financeiro" ou "Desenvolvimento: Teste". */
export const rotulo = (w: Workspace): string => `${nomeAmbiente(w.ambiente)}: ${w.cliente}`;

/** Motivo pelo qual o ambiente não pode ser excluído ('' = pode). O servidor confere as mesmas regras. */
export function motivoNaoExcluir(totalAmbientes: number, maquinas: number): string {
  if (totalAmbientes <= 1) return 'É preciso manter ao menos um ambiente';
  return maquinas ? `Há ${maquinas} ${maquinas > 1 ? 'máquinas cadastradas' : 'máquina cadastrada'}` : '';
}

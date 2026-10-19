import type { AppData } from '../types';

const ATIVOS = ['na fila', 'em execução', 'cancelando'];

/** Motivo pelo qual a máquina não pode ser excluída ('' = pode). */
export function usoMaquina(d: AppData, id: string): string {
  const m = d.machines.find((x) => x.id === id);
  const ag = d.schedules.filter((s) => s.m === id).length + (m?.emUso?.schedules ?? 0);
  const ex = d.runs.filter((r) => r.m === id && ATIVOS.includes(r.status)).length + (m?.emUso?.activeJobs ?? 0);
  const au = d.automations.filter((a) => (a.runnerIds ?? []).includes(id)).length;
  const p: string[] = [];
  if (au) p.push(`${au} ${au > 1 ? 'automações atreladas' : 'automação atrelada'}`);
  if (ag) p.push(`${ag} ${ag > 1 ? 'agendamentos' : 'agendamento'}`);
  if (ex) p.push(`${ex} ${ex > 1 ? 'execuções ativas' : 'execução ativa'}`);
  return p.length ? `Em uso: ${p.join(' e ')}` : '';
}

/** Automação com execução em andamento não pode ser excluída. */
export const automacaoEmUso = (d: AppData, id: string): boolean =>
  d.runs.some((r) => r.a === id && (r.status === 'em execução' || r.status === 'cancelando'));

import type { Asset, Automation, Machine, Parametro, RunStatus, StatusFila, TipoParametro } from '../types';
import { api } from './api';

// Nomes dos tipos: o front usa "data" e "confidencial"; a API usa "date" e "secret".
const TIPO_API: Record<TipoParametro, string> = { string: 'string', int: 'int', float: 'float', bool: 'bool', data: 'date', confidencial: 'secret' };
const TIPO_FRONT: Record<string, TipoParametro> = { string: 'string', int: 'int', float: 'float', bool: 'bool', date: 'data', secret: 'confidencial' };

interface RunnerApi { id: string; name: string; status: 'online' | 'offline'; paired: boolean; lastHeartbeatAt: string | null; version: string | null; inUse: { schedules: number; activeJobs: number; automations: number } }
interface AutomationApi { id: string; name: string; description: string; version: number | null; runners: { id: string; name: string }[]; hasPackage: boolean; packageSize: number | null; createdAt: string }
interface ParamApi { id: string; name: string; type: string; value: string | null; active: boolean; description: string }
type DadosItem = Pick<Parametro, 'nome' | 'tipo' | 'valor' | 'desc'>;
const corpo = (d: DadosItem) => ({ name: d.nome, type: TIPO_API[d.tipo], value: d.valor, description: d.desc });

// ---- Máquinas ----
export const listarMaquinas = async (w: string): Promise<Machine[]> =>
  (await api<RunnerApi[]>('/runners', { workspaceId: w })).map((r) => ({
    id: r.id, nome: r.name, pareada: r.paired, online: r.status === 'online', hb: r.lastHeartbeatAt, runner: r.version ?? '—', emUso: r.inUse,
  }));
export const criarMaquina = (w: string, nome: string) => api('/runners', { workspaceId: w, body: { name: nome } });
export const gerarChave = (w: string, id: string) => api<{ key: string; expiresAt: string }>(`/runners/${id}/pairing-key`, { workspaceId: w, method: 'POST', body: {} });
export const desparearMaquina = (w: string, id: string) => api(`/runners/${id}/unpair`, { workspaceId: w, method: 'POST', body: {} });
export const simularMaquina = (w: string, id: string) => api(`/runners/${id}/simulate`, { workspaceId: w, method: 'POST', body: {} });
export const excluirMaquinas = (w: string, ids: string[]) =>
  api<{ deleted: number; skipped: { id: string; reason: string }[] }>('/runners/bulk-delete', { workspaceId: w, body: { ids } });

// ---- Automações (a versão exibida é a inteira da API; "v1", "v2"...) ----
export interface Versao { id: string; version: number; size: number | null; sha256: string | null; entrypoint: string | null; createdAt: string; current: boolean; hasPackage: boolean }

export const listarAutomacoes = async (w: string): Promise<Automation[]> =>
  (await api<AutomationApi[]>('/automations', { workspaceId: w })).map((a) => ({
    id: a.id, nome: a.name, desc: a.description, versao: String(a.version ?? 1), criada: a.createdAt,
    runnerIds: a.runners.map((r) => r.id), temPacote: a.hasPackage, tamanhoPacote: a.packageSize,
  }));
export const criarAutomacao = (w: string, nome: string, desc: string, runnerIds: string[]) =>
  api<{ id: string }>('/automations', { workspaceId: w, body: { name: nome, description: desc, runnerIds } });
export const atrelarMaquinas = (w: string, id: string, runnerIds: string[]) => api(`/automations/${id}`, { workspaceId: w, method: 'PATCH', body: { runnerIds } });
export const excluirAutomacao = (w: string, id: string) => api(`/automations/${id}`, { workspaceId: w, method: 'DELETE' });
/** Envia o .zip da automação (vira uma nova versão; a primeira preenche a versão 1). */
export const enviarPacote = (w: string, id: string, arquivo: File) => api(`/automations/${id}/package`, { workspaceId: w, arquivo });
export const listarVersoes = (w: string, id: string) => api<Versao[]>(`/automations/${id}/versions`, { workspaceId: w });
export const ativarVersao = (w: string, id: string, versaoId: string) => api(`/automations/${id}/versions/${versaoId}/activate`, { workspaceId: w, method: 'POST', body: {} });

// ---- Parâmetros da automação ----
export const listarParametros = async (w: string, aid: string): Promise<Parametro[]> =>
  (await api<ParamApi[]>(`/automations/${aid}/parameters`, { workspaceId: w })).map((p) => ({
    id: p.id, nome: p.name, tipo: TIPO_FRONT[p.type] ?? 'string', valor: p.value ?? '', desc: p.description, ativo: p.active,
  }));
export const criarParametro = (w: string, aid: string, d: DadosItem) => api(`/automations/${aid}/parameters`, { workspaceId: w, body: corpo(d) });
export const alterarParametro = (w: string, aid: string, pid: string, d: DadosItem) =>
  api(`/automations/${aid}/parameters/${pid}`, { workspaceId: w, method: 'PATCH', body: corpo(d) });
export const ativarParametro = (w: string, aid: string, pid: string, ativo: boolean) =>
  api(`/automations/${aid}/parameters/${pid}`, { workspaceId: w, method: 'PATCH', body: { active: ativo } });
export const excluirParametros = (w: string, aid: string, ids: string[]) =>
  api(`/automations/${aid}/parameters/bulk-delete`, { workspaceId: w, body: { ids } });

// ---- Ativos (pasta + escopo global/local) ----
interface AssetApi { id: string; folder: string; name: string; type: string; value: string | null; scope: 'global' | 'local'; automationId: string | null; active: boolean; description: string }
type DadosAtivo = DadosItem & { pasta?: string; escopo?: 'global' | 'local'; automacaoId?: string };
const corpoAtivo = (d: DadosAtivo) => ({ ...corpo(d), folder: d.pasta, scope: d.escopo, automationId: d.escopo === 'local' ? d.automacaoId : null });

export const listarAtivos = async (w: string): Promise<Asset[]> =>
  (await api<AssetApi[]>('/assets', { workspaceId: w })).map((a) => ({
    id: a.id, pasta: a.folder, nome: a.name, tipo: TIPO_FRONT[a.type] ?? 'string', valor: a.value ?? '', escopo: a.scope,
    automacaoId: a.automationId ?? undefined, ativo: a.active, desc: a.description,
  }));
export const criarAtivo = (w: string, d: DadosAtivo) => api('/assets', { workspaceId: w, body: corpoAtivo(d) });
export const alterarAtivo = (w: string, id: string, d: DadosAtivo) => api(`/assets/${id}`, { workspaceId: w, method: 'PATCH', body: corpoAtivo(d) });
export const ativarAtivo = (w: string, id: string, ativo: boolean) => api(`/assets/${id}`, { workspaceId: w, method: 'PATCH', body: { active: ativo } });
export const excluirAtivos = (w: string, ids: string[]) => api('/assets/bulk-delete', { workspaceId: w, body: { ids } });

// ---- Agendamentos ----
interface ScheduleApi { id: string; automation: string; automationId: string; runner: string | null; runnerId: string | null; cron: string; enabled: boolean; lastRunAt: string | null }
export interface Agendamento { id: string; automacao: string; automacaoId: string; maquina: string | null; cron: string; ativo: boolean; ultima: string | null }

export const listarAgendamentos = async (w: string): Promise<Agendamento[]> =>
  (await api<ScheduleApi[]>('/schedules', { workspaceId: w })).map((s) => ({
    id: s.id, automacao: s.automation, automacaoId: s.automationId, maquina: s.runner, cron: s.cron, ativo: s.enabled, ultima: s.lastRunAt,
  }));
export const criarAgendamento = (w: string, automationId: string, runnerId: string, cron: string) =>
  api('/schedules', { workspaceId: w, body: { automationId, runnerId, cron } });
export const ativarAgendamento = (w: string, id: string, enabled: boolean) => api(`/schedules/${id}`, { workspaceId: w, method: 'PATCH', body: { enabled } });
export const excluirAgendamentos = (w: string, ids: string[]) => api('/schedules/bulk-delete', { workspaceId: w, body: { ids } });

// ---- Execuções (JOBs) e logs ----
const STATUS_JOB: Record<string, RunStatus> = {
  pending: 'em execução', assigned: 'em execução', running: 'em execução', cancelling: 'cancelando',
  success: 'concluída', failed: 'falha', cancelled: 'cancelada', timeout: 'abortada',
};
interface JobApi { id: string; automation: { id: string; name: string; deleted: boolean }; version: number; runner: string | null; status: string; queuedAt: string; startedAt: string | null; finishedAt: string | null }
export interface Execucao { id: string; automacaoId: string; automacao: string; excluida: boolean; versao: number; maquina: string | null; status: RunStatus; enfileirada: string; iniciada: string | null; finalizada: string | null }
const paraExecucao = (j: JobApi): Execucao => ({
  id: j.id, automacaoId: j.automation.id, automacao: j.automation.name, excluida: j.automation.deleted, versao: j.version, maquina: j.runner,
  status: STATUS_JOB[j.status] ?? 'em execução', enfileirada: j.queuedAt, iniciada: j.startedAt, finalizada: j.finishedAt,
});

export const listarExecucoes = async (w: string, o: { pageSize?: number; ativos?: boolean } = {}): Promise<{ total: number; items: Execucao[] }> => {
  const q = new URLSearchParams({ pageSize: String(o.pageSize ?? 100) });
  if (o.ativos) q.set('ativos', 'true');
  const r = await api<{ total: number; items: JobApi[] }>(`/jobs?${q.toString()}`, { workspaceId: w });
  return { total: r.total, items: r.items.map(paraExecucao) };
};
export const obterExecucao = async (w: string, id: string): Promise<Execucao> => paraExecucao(await api<JobApi>(`/jobs/${id}`, { workspaceId: w }));
export const iniciarExecucao = (w: string, automationId: string, runnerId: string) => api<{ id: string }>('/jobs', { workspaceId: w, body: { automationId, runnerId } });
export const cancelarExecucao = (w: string, id: string, mode: 'graceful' | 'abrupt') => api(`/jobs/${id}/cancel`, { workspaceId: w, body: { mode } });
export const simularExecucao = (w: string, id: string, status: 'success' | 'failed' | 'timeout' | 'cancelled') => api(`/jobs/${id}/simulate`, { workspaceId: w, body: { status } });
export interface LinhaLog { ts: string; level: 'INFO' | 'WARN' | 'ERROR'; source: string; message: string }
export const logsExecucao = (w: string, id: string) => api<LinhaLog[]>(`/jobs/${id}/logs`, { workspaceId: w });

// ---- Fila ----
const STATUS_FILA: Record<string, StatusFila> = { new: 'NEW', waiting: 'AGUARDANDO', in_progress: 'PROCESSANDO', done: 'SUCESSO', failed: 'FALHA', cancelled: 'CANCELADO' };
interface ItemApi { id: string; reference: string | null; status: string; jobId: string | null; log: string; queuedAt: string; updatedAt: string }
export interface ItemDaFila { id: string; referencia: string | null; status: StatusFila; jobId: string | null; log: string; timestamp: string; atualizado: string }
export type AcaoFilaApi = 'cancel' | 'cancel_job' | 'duplicate' | 'reprocess';

export const listarFila = async (w: string, automacaoId: string, o: { page: number; pageSize: number; order: 'recent' | 'oldest' }): Promise<{ total: number; items: ItemDaFila[] }> => {
  const r = await api<{ total: number; items: ItemApi[] }>(`/automations/${automacaoId}/queue-items?page=${o.page}&pageSize=${o.pageSize}&order=${o.order}`, { workspaceId: w });
  return { total: r.total, items: r.items.map((i) => ({ id: i.id, referencia: i.reference, status: STATUS_FILA[i.status] ?? 'NEW', jobId: i.jobId, log: i.log, timestamp: i.queuedAt, atualizado: i.updatedAt })) };
};
export const acaoFila = (w: string, action: AcaoFilaApi, ids: string[]) => api<{ requested: number; affected: number; jobs?: number }>('/queue-items/actions', { workspaceId: w, body: { action, ids } });
/** Somente demonstração: insere itens de exemplo (a inserção real será feita pela automação via Python). */
export const gerarItensExemplo = (w: string, automacaoId: string, qtd: number, base: number) =>
  api(`/automations/${automacaoId}/queue-items`, {
    workspaceId: w,
    body: {
      items: Array.from({ length: qtd }, (_, i) => {
        const n = base + i + 1; // exemplos com formatos diferentes: os campos são livres, definidos pela automação
        return n % 3 === 0
          ? { reference: `PED-${n}`, data: { pedido: n, cliente: { nome: `Cliente ${n}`, cidade: 'Sorocaba' }, itens: ['A', 'B'], urgente: n % 2 === 0 } }
          : { reference: `Cliente ${n}`, data: { nome: `Cliente ${n}`, idade: 20 + (n % 50), sexo: n % 2 ? 'Feminino' : 'Masculino', salario: (3000 + (i * 750) % 17000).toFixed(2) } };
      }),
    },
  });
export const simularRunnerFila = (w: string, automacaoId: string) => api(`/automations/${automacaoId}/simulate-runner`, { workspaceId: w, method: 'POST', body: {} });

interface ItemDetalheApi { id: string; automationId: string | null; automation: string | null; reference: string | null; data: Record<string, unknown>; status: string; jobId: string | null; log: string; error: string | null; attempts: number; queuedAt: string; updatedAt: string; finishedAt: string | null }
export interface ItemDetalhe { id: string; automacao: string | null; referencia: string | null; dados: Record<string, unknown>; status: StatusFila; jobId: string | null; log: string; erro: string | null; tentativas: number; timestamp: string; atualizado: string; finalizado: string | null }
export const obterItemFila = async (w: string, id: string): Promise<ItemDetalhe> => {
  const i = await api<ItemDetalheApi>(`/queue-items/${id}`, { workspaceId: w });
  return { id: i.id, automacao: i.automation, referencia: i.reference, dados: i.data, status: STATUS_FILA[i.status] ?? 'NEW', jobId: i.jobId, log: i.log, erro: i.error, tentativas: i.attempts, timestamp: i.queuedAt, atualizado: i.updatedAt, finalizado: i.finishedAt };
};

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, mensagem } from '../services/api';
import { listarAutomacoes, listarMaquinas } from '../services/recursos';
import { vazio } from '../services/seed';
import type { Ambiente, AppData, Automation, Machine, Workspace } from '../types';

interface WorkspaceApi { id: string; name: string; environment: 'production' | 'development'; createdAt: string; machines: number; automations: number }
const paraFront = (w: WorkspaceApi): Workspace => ({ id: w.id, cliente: w.name, ambiente: w.environment === 'production' ? 'produção' : 'testes', criado: w.createdAt });

// Pela API: ambientes, máquinas, automações e parâmetros. Ainda no navegador (etapa 3): ativos, fila, execuções e agendamentos.
const LS_LOCAL = 'rpa:local';
const LS_WS = 'rpa:ws';
const LS_FILA_V2 = 'rpa:fila-v2';
const LS_FILA_V3 = 'rpa:fila-v3';
const LS_API_3A = 'rpa:api-3a';
const LS_API_3B = 'rpa:api-3b';
const lerLocais = (): Record<string, AppData> => {
  try {
    const l = JSON.parse(localStorage.getItem(LS_LOCAL) ?? '{}') as Record<string, AppData>;
    if (!localStorage.getItem(LS_FILA_V2)) { // status antigos da fila: AGUARDANDO (inicial) -> NEW; EXECUTANDO -> PROCESSANDO
      for (const d of Object.values(l)) {
        d.fila = (d.fila ?? []).map((f) => {
          const antigo = f.status as string;
          return antigo === 'AGUARDANDO' ? { ...f, status: 'NEW' as const } : antigo === 'EXECUTANDO' ? { ...f, status: 'PROCESSANDO' as const } : f;
        });
      }
      localStorage.setItem(LS_LOCAL, JSON.stringify(l));
      localStorage.setItem(LS_FILA_V2, '1');
    }
    if (!localStorage.getItem(LS_FILA_V3)) { // modelo com JOB: AGUARDANDO/PROCESSANDO sem JOB voltam a NEW
      for (const d of Object.values(l)) {
        d.fila = (d.fila ?? []).map((f) => ((f.status === 'AGUARDANDO' || f.status === 'PROCESSANDO') && !f.jobId ? { ...f, status: 'NEW' as const } : f));
      }
      localStorage.setItem(LS_LOCAL, JSON.stringify(l));
      localStorage.setItem(LS_FILA_V3, '1');
    }
    if (!localStorage.getItem(LS_API_3A)) { // ativos e agendamentos agora vêm da API: descarta os dados locais antigos
      for (const d of Object.values(l)) { d.assets = []; d.schedules = []; }
      localStorage.setItem(LS_LOCAL, JSON.stringify(l));
      localStorage.setItem(LS_API_3A, '1');
    }
    if (!localStorage.getItem(LS_API_3B)) { // execuções e fila agora vêm da API: descarta os dados locais antigos
      for (const d of Object.values(l)) { d.runs = []; d.fila = []; }
      localStorage.setItem(LS_LOCAL, JSON.stringify(l));
      localStorage.setItem(LS_API_3B, '1');
    }
    return l;
  } catch { return {}; }
};
const gravar = (n: Record<string, AppData>) => { try { localStorage.setItem(LS_LOCAL, JSON.stringify(n)); } catch { /* ignora */ } return n; };

interface Recursos { maquinas: Machine[]; automacoes: Automation[]; prontos: boolean }
interface Ctx {
  data: AppData; update: (fn: (d: AppData) => AppData) => void;
  workspaces: Workspace[]; atual: Workspace; contagem: (id: string) => { maquinas: number; automacoes: number };
  selecionar: (id: string) => void;
  criar: (cliente: string, ambiente: Ambiente) => Promise<string>; // devolve a mensagem de erro ('' = ok)
  excluir: (id: string) => Promise<string>;
  /** Máquinas e automações do ambiente já chegaram da API? */
  prontos: boolean;
  /** Recarrega máquinas e automações (chame depois de criar/alterar/excluir pela API). */
  recarregarRecursos: () => Promise<void>;
}
const DataCtx = createContext<Ctx | null>(null);

export function DataProvider({ children, onSessaoExpirada }: { children: ReactNode; onSessaoExpirada: () => void }) {
  const [ws, setWs] = useState<WorkspaceApi[] | null>(null);
  const [erro, setErro] = useState('');
  const [atualId, setAtualId] = useState(() => { try { return localStorage.getItem(LS_WS) ?? ''; } catch { return ''; } });
  const [locais, setLocais] = useState<Record<string, AppData>>(lerLocais);
  const [rec, setRec] = useState<Recursos>({ maquinas: [], automacoes: [], prontos: false });
  const idEfetivo = ws?.some((w) => w.id === atualId) ? atualId : ws?.[0]?.id ?? '';

  const falhou = useCallback((e: unknown) => { if (e instanceof ApiError && e.status === 401) onSessaoExpirada(); else setErro(mensagem(e)); }, [onSessaoExpirada]);
  const recarregar = useCallback(async () => {
    try { setWs(await api<WorkspaceApi[]>('/workspaces')); setErro(''); } catch (e) { falhou(e); }
  }, [falhou]);
  const recarregarRecursos = useCallback(async () => {
    if (!idEfetivo) return;
    try {
      const [maquinas, automacoes] = await Promise.all([listarMaquinas(idEfetivo), listarAutomacoes(idEfetivo)]);
      setRec({ maquinas, automacoes, prontos: true }); setErro('');
      void recarregar(); // atualiza as contagens da tela Ambientes
    } catch (e) { falhou(e); }
  }, [idEfetivo, falhou, recarregar]);

  useEffect(() => { void recarregar(); }, [recarregar]);
  useEffect(() => { setRec({ maquinas: [], automacoes: [], prontos: false }); void recarregarRecursos(); }, [recarregarRecursos]);

  if (erro) return (
    <div className="login"><div className="card">
      <h1>Sem conexão com o servidor</h1><p>{erro}</p>
      <button className="btn" onClick={() => { void recarregar(); void recarregarRecursos(); }}>Tentar de novo</button>
    </div></div>
  );
  if (!ws) return <div className="login">Carregando…</div>;
  if (!ws.length) return <div className="login"><div className="card">Nenhum ambiente cadastrado para este cliente. Peça ao administrador para criar um.</div></div>;

  const lista = ws.map(paraFront);
  const atual = lista.find((w) => w.id === idEfetivo) ?? lista[0];
  const selecionar = (id: string) => { setAtualId(id); try { localStorage.setItem(LS_WS, id); } catch { /* ignora */ } };
  // Máquinas e automações vêm sempre da API; o restante vem do armazenamento local.
  const mesclar = (l: AppData | undefined): AppData => ({ ...(l ?? vazio()), machines: rec.maquinas, automations: rec.automacoes });

  const value: Ctx = {
    data: mesclar(locais[atual.id]),
    update: (fn) => setLocais((p) => gravar({ ...p, [atual.id]: { ...fn(mesclar(p[atual.id])), machines: [], automations: [] } })),
    workspaces: lista, atual, selecionar, prontos: rec.prontos, recarregarRecursos,
    contagem: (id) => {
      const a = ws.find((w) => w.id === id);
      return { maquinas: a?.machines ?? 0, automacoes: a?.automations ?? 0 };
    },
    criar: async (cliente, ambiente) => {
      try {
        const w = await api<{ id: string }>('/workspaces', { body: { name: cliente.trim(), environment: ambiente === 'produção' ? 'production' : 'development' } });
        await recarregar(); selecionar(w.id); return '';
      } catch (e) { return mensagem(e); }
    },
    excluir: async (id) => {
      try {
        await api(`/workspaces/${id}`, { method: 'DELETE' });
        setLocais((p) => { const n = { ...p }; delete n[id]; return gravar(n); });
        await recarregar(); return '';
      } catch (e) { return mensagem(e); }
    },
  };
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useData deve ser usado dentro de <DataProvider>');
  return c;
}

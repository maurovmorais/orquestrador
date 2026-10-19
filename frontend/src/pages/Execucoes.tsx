import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { CancelModal } from '../components/CancelModal';
import { DataTable } from '../components/DataTable';
import { MODO_DEMO } from '../config/env';
import { useData } from '../context/DataContext';
import { fmtData } from '../lib/format';
import { mensagem } from '../services/api';
import { cancelarExecucao, iniciarExecucao, listarExecucoes, simularExecucao, type Execucao } from '../services/recursos';
import type { Machine } from '../types';

type Sim = 'success' | 'failed' | 'timeout' | 'cancelled';
const SIM_ATIVA: [Sim, string][] = [['success', 'Concluída'], ['failed', 'Falha'], ['timeout', 'Abortada (48 h sem resposta)']];
const SIM_CANCELANDO: [Sim, string][] = [['cancelled', 'Item concluído, cancelar'], ['failed', 'Falha']];

export default function Execucoes() {
  const { data: d, atual, recarregarRecursos } = useData();
  const [itens, setItens] = useState<Execucao[]>([]);
  const [a, setA] = useState('');
  const [escolhida, setEscolhida] = useState('');
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  const aut = d.automations.find((x) => x.id === a);
  const maqAut = (aut?.runnerIds ?? []).map((id) => d.machines.find((x) => x.id === id)).filter((x): x is Machine => !!x);
  const m = maqAut.some((x) => x.id === escolhida) ? escolhida : (maqAut.find((x) => x.online) ?? maqAut[0])?.id ?? ''; // a escolhida ou a 1ª online
  const mOk = maqAut.some((x) => x.id === m && x.online);

  const carregar = useCallback(async () => {
    try { setItens((await listarExecucoes(atual.id)).items); } catch (e) { setErro(mensagem(e)); }
  }, [atual.id]);
  useEffect(() => { void carregar(); const t = setInterval(() => void carregar(), 4000); return () => clearInterval(t); }, [carregar]);

  /** Chama a API, recarrega a lista (e o uso das máquinas) e mostra o erro, se houver. */
  const agir = async (fn: () => Promise<unknown>) => {
    setErro('');
    try { await fn(); await carregar(); await recarregarRecursos(); } catch (e) { setErro(mensagem(e)); }
  };

  const simular = (id: string, opcoes: [Sim, string][]) => (
    <select className="sim" value="" title="Somente demonstração: simula o retorno do runner"
      onChange={(e) => e.target.value && void agir(() => simularExecucao(atual.id, id, e.target.value as Sim))}>
      <option value="">Simular retorno…</option>
      {opcoes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  return (
    <>
      <h1>Execuções</h1>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="bar" style={{ margin: 0 }}>
          <select value={a} onChange={(e) => setA(e.target.value)}>
            <option value="">Automação…</option>
            {d.automations.map((x) => <option key={x.id} value={x.id}>{x.nome} — {x.desc}</option>)}
          </select>
          {aut && (maqAut.length ? (
            <select value={m} aria-label="Máquina" onChange={(e) => setEscolhida(e.target.value)}>
              {maqAut.map((x) => <option key={x.id} value={x.id}>{x.nome} ({x.online ? 'online' : 'offline'})</option>)}
            </select>
          ) : <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Esta automação ainda não tem máquina atrelada.</span>)}
          <button className="btn" disabled={!a || !mOk || !aut?.temPacote} onClick={() => void agir(async () => { await iniciarExecucao(atual.id, a, m); setA(''); })}>Executar</button>
          {aut && !aut.temPacote && <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>Envie o pacote (.zip) da automação antes de executar.</span>}
          {aut && aut.temPacote && !mOk && <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>Só é possível executar em uma máquina online.</span>}
        </div>
        {erro && <p className="err" style={{ margin: '10px 0 0' }}>{erro}</p>}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 14px' }}>
        Status: <b>concluída</b> = terminou com sucesso · <b>falha</b> = terminou com erro · <b>cancelando</b> = aguardando o item
        atual terminar · <b>cancelada</b> = cancelamento concluído · <b>abortada</b> = mais de 48 h sem resposta.
      </p>
      <DataTable cols={['Automação', 'Versão', 'Máquina', 'Status', 'Enfileirada', 'Iniciada', 'Finalizada', '']} hasRows={itens.length > 0} empty="Nenhuma execução.">
        {itens.map((r) => (
          <tr key={r.id}>
            <td><Link className="lnk" to={`/execucoes/${r.id}`}>{r.excluida ? '(excluída)' : r.automacao}</Link></td>
            <td>v{r.versao}</td><td>{r.maquina ?? '—'}</td><td><Badge status={r.status} /></td>
            <td>{fmtData(r.enfileirada)}</td><td>{fmtData(r.iniciada)}</td><td>{fmtData(r.finalizada)}</td>
            <td className="act"><div>
              {r.status === 'cancelando' && (
                <>
                  <button className="btn red sm" onClick={() => void agir(() => cancelarExecucao(atual.id, r.id, 'abrupt'))}>Forçar encerramento</button>
                  {MODO_DEMO && simular(r.id, SIM_CANCELANDO)}
                </>
              )}
              {r.status === 'em execução' && (
                <>
                  <button className="btn red sm" onClick={() => setCancelando(r.id)}>Cancelar</button>
                  {MODO_DEMO && simular(r.id, SIM_ATIVA)}
                </>
              )}
            </div></td>
          </tr>
        ))}
      </DataTable>
      {cancelando && (
        <CancelModal onClose={() => setCancelando(null)} onPick={(modo) => { const id = cancelando; setCancelando(null); void agir(() => cancelarExecucao(atual.id, id, modo === 'elegante' ? 'graceful' : 'abrupt')); }} />
      )}
    </>
  );
}
